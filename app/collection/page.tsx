import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { getFlags } from '@/lib/flags'
import { applyAudienceFilter } from '@/lib/productVisibility'
import {
  applyCategoryVisibilityFilter,
  bypassesCategoryVisibility,
  getNonPublicCategoryIds,
} from '@/lib/categoryVisibility'
import { CollectionGrid } from '@/components/CollectionGrid'
import { HeroImageOverlay } from '@/components/HeroImageOverlay'

async function getHeroImage(key: string, fallbackAlt: string) {
  const { data } = await supabaseAdmin.from('site_settings').select('value').eq('key', key).single()
  const val = data?.value as { url?: string; alt?: string } | null
  return { url: val?.url ?? '', alt: val?.alt ?? fallbackAlt }
}

export const metadata = {
  title: 'The FBA Collection',
  description:
    'Limited collaborations between Full Bloom Artelier and single maker studios — maximum 24 numbered units per piece, each with a Technical Passport™. Trade reservation open.',
  alternates: { canonical: '/collection' },
}

// ─── Data ────────────────────────────────────────────────────────────────────

async function getStats(role: string | null | undefined, hiddenCategoryIds: string[]) {
  let q = supabaseAdmin
    .from('products')
    .select('id')
    .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null)
    .eq('is_fba_collection', true)
  q = applyAudienceFilter(q, role)
  // Spec §5: the count must match the grid — both exclude hidden categories.
  q = applyCategoryVisibilityFilter(q, hiddenCategoryIds, role)

  const { data } = await q
  return { total: data?.length ?? 0 }
}

// Server-side initial pieces so the grid is crawlable and paints without a
// client round-trip (fix B4). Mirrors /api/products?collection=true&limit=60.
async function getInitialPieces(role: string | null | undefined, hiddenCategoryIds: string[]) {
  let q = supabaseAdmin
    .from('products')
    .select(`
      *,
      category:categories(id, name, slug),
      subcategory:subcategories(id, name, slug),
      artisan:artisans(id, name, slug, location)
    `)
    .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null)
    .eq('is_fba_collection', true)
  q = applyAudienceFilter(q, role)
  q = applyCategoryVisibilityFilter(q, hiddenCategoryIds, role)
  const { data } = await q.order('created_at', { ascending: false }).limit(60)
  // Sprint 15 security pass (md doc §17): these rows serialise into a
  // client component's props — strip internal commercial figures for
  // non-staff viewers before they leave the server.
  const isStaff = role === 'admin' || role === 'staff'
  return (data ?? []).map(prd => {
    if (isStaff) return prd
    const cleaned = { ...(prd as Record<string, unknown>) }
    delete cleaned.supplier_cost
    if (role !== 'trade_user') delete cleaned.trade_price
    return cleaned
  })
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function CollectionPage() {
  const flags = await getFlags()
  if (!flags.show_collection) redirect('/coming-soon')

  const session = await getSession()
  // Spec §5: resolved once and shared so the count and the grid agree.
  const hiddenCategoryIds = bypassesCategoryVisibility(session?.role)
    ? []
    : await getNonPublicCategoryIds()
  const [stats, heroImage, initialPieces] = await Promise.all([
    getStats(session?.role, hiddenCategoryIds),
    getHeroImage('collection_hero_image', 'The FBA Collection — Limited Edition Pieces'),
    getInitialPieces(session?.role, hiddenCategoryIds),
  ])
  const isTradeUser = ['trade_user', 'admin', 'staff'].includes(session?.role ?? '')

  return (
    <div className="page-body">

      {/* ── 1. HERO ─────────────────────────────────────────────── */}
      <section style={{
        background: 'var(--forest)',
        padding: 'clamp(80px, 10vw, 120px) 0 clamp(64px, 8vw, 80px)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <HeroImageOverlay url={heroImage.url} />
        {/* Subtle texture overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(ellipse at 60% 40%, rgba(196,168,130,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 2,
        }} />

        <div className="container" style={{ maxWidth: 680, position: 'relative', zIndex: 3 }}>
          <div className="label" style={{ color: 'rgba(196,168,130,0.65)', marginBottom: 24, letterSpacing: '0.22em' }}>
            FBA Collection · Limited Edition
          </div>

          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(36px, 5vw, 60px)',
            fontWeight: 300,
            color: 'var(--cream)',
            letterSpacing: '-0.02em',
            lineHeight: 1.02,
            marginBottom: 32,
          }}>
            Where craft<br />becomes legacy
          </h1>

          <p style={{
            fontSize: 15,
            color: 'rgba(247,243,238,0.82)',
            lineHeight: 1.85,
            letterSpacing: '0.01em',
            marginBottom: 48,
            maxWidth: 520,
            margin: '0 auto 44px',
          }}>
            Each FBA Collection piece is a direct collaboration between Full Bloom Artelier
            and a single vetted maker studio — designed to specification, produced in limited
            number, and available exclusively through the studio.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#pieces" className="btn btn-primary" style={{
              background: 'var(--sand)',
              color: 'var(--forest)',
              borderColor: 'var(--sand)',
            }}>
              View the Collection
            </a>
            {!isTradeUser && (
              <Link href="/trade/apply" className="btn btn-ghost" style={{
                borderColor: 'rgba(196,168,130,0.35)',
                color: 'rgba(247,243,238,0.8)',
              }}>
                Apply for Trade Access
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ── 2. STATS BAR ────────────────────────────────────────── */}
      <section style={{
        background: 'var(--forest-mid)',
        borderTop: '1px solid rgba(196,168,130,0.12)',
        borderBottom: '1px solid rgba(196,168,130,0.12)',
      }}>
        <div className="container">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 0,
          }}>
            {[
              {
                value: stats.total.toString(),
                label: 'Pieces in Collection',
                sub:   'Each object designed in direct collaboration with a single maker studio',
              },
              {
                value: 'Ltd',
                label: 'Production Runs',
                sub:   'Maximum 24 units per piece, globally. Never repeated once sold out',
              },
              {
                value: '100%',
                label: 'Technical Passport Certified',
                sub:   'Every piece pre-cleared for UK, EU and GCC contract specifications',
              },
            ].map((stat, i) => (
              <div key={i} style={{
                padding: 'clamp(32px, 5vw, 56px) clamp(20px, 4vw, 48px)',
                borderRight: i < 2 ? '1px solid rgba(196,168,130,0.12)' : 'none',
                textAlign: 'center',
              }}>
                <div style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 'clamp(36px, 5vw, 56px)',
                  fontWeight: 300,
                  color: 'var(--sand)',
                  lineHeight: 1,
                  marginBottom: 8,
                }}>
                  {stat.value}
                </div>
                <div style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: 'var(--cream)',
                  marginBottom: 10,
                }}>
                  {stat.label}
                </div>
                <p style={{ fontSize: 12, color: 'rgba(247,243,238,0.45)', lineHeight: 1.7, maxWidth: 200, margin: '0 auto' }}>
                  {stat.sub}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. CONCEPT EDITORIAL ────────────────────────────────── */}
      <section style={{
        padding: 'clamp(72px, 10vw, 120px) 0',
        background: 'var(--warm-white)',
        borderBottom: '1px solid var(--light-line)',
      }}>
        <div className="container">
          <div className="fba-grid-2" style={{
            gap: 'clamp(40px, 8vw, 96px)',
            alignItems: 'center',
          }}>
            {/* Left — text */}
            <div>
              <div className="label label-sage" style={{ marginBottom: 20 }}>The Concept</div>
              <h2 style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 'clamp(28px, 3.5vw, 46px)',
                fontWeight: 300,
                color: 'var(--forest)',
                lineHeight: 1.15,
                letterSpacing: '0',
                marginBottom: 28,
              }}>
                Objects designed once.<br />
                <em style={{ fontStyle: 'italic', color: 'var(--caramel)' }}>Never repeated.</em>
              </h2>

              <div className="divider" />

              <p style={{ fontSize: 15, color: 'var(--stone)', lineHeight: 1.85, marginBottom: 20 }}>
                The FBA Collection sits outside The Edit. While The Edit is built around sourcing
                and specifying from existing maker catalogues, the Collection is where Full Bloom
                Artelier steps in as co-creator — bringing a design brief directly to a single
                studio and working through every detail until the object is exactly right.
              </p>
              <p style={{ fontSize: 15, color: 'var(--stone)', lineHeight: 1.85, marginBottom: 20 }}>
                Each piece carries a numbered certificate, a full Technical Passport, and a maker
                provenance record. For projects where specification and storytelling converge, the
                Collection offers something The Edit cannot: pieces that belong to your project
                and nowhere else.
              </p>
              <p style={{ fontSize: 15, color: 'var(--stone)', lineHeight: 1.85 }}>
                Production runs are fixed at the outset and never reopened. When a piece sells
                out, it is retired permanently from the Collection.
              </p>
            </div>

            {/* Right — decorative block */}
            <div style={{
              background: 'var(--forest)',
              padding: 'clamp(48px, 7vw, 80px) clamp(32px, 5vw, 60px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              minHeight: 360,
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'radial-gradient(ellipse at 50% 50%, rgba(196,168,130,0.08) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />
              <div style={{
                fontSize: 32,
                color: 'var(--sand)',
                marginBottom: 24,
                opacity: 0.7,
              }}>◆</div>
              <div style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 'clamp(18px, 2.5vw, 26px)',
                fontWeight: 300,
                color: 'var(--cream)',
                lineHeight: 1.4,
                letterSpacing: '0',
                marginBottom: 16,
              }}>
                "For projects where<br />specification and<br />storytelling converge."
              </div>
              <div style={{ width: 32, height: 1, background: 'var(--sand)', opacity: 0.4, margin: '24px 0' }} />
              <div style={{
                fontSize: 9,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'rgba(196,168,130,0.6)',
              }}>
                FBA Collection · London · 2026
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. THE PIECES ────────────────────────────────────────── */}
      <section id="pieces" style={{
        padding: 'clamp(72px, 10vw, 112px) 0',
        background: 'var(--cream)',
      }}>
        <div className="container">
          {/* Section heading */}
          <div style={{ marginBottom: 48 }}>
            <div className="label label-sage" style={{ marginBottom: 16 }}>The Pieces</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
              <h2 style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 'clamp(26px, 3vw, 40px)',
                fontWeight: 300,
                color: 'var(--forest)',
                letterSpacing: '0',
              }}>
                Current Collection
              </h2>
              {stats.total > 0 && (
                <p style={{ fontSize: 13, color: 'var(--stone)' }}>
                  {stats.total} {stats.total === 1 ? 'collaboration' : 'collaborations'}.{' '}
                  Each piece a single edition.
                </p>
              )}
            </div>
          </div>

          {/* Interactive grid with tabs + filters */}
          <Suspense fallback={<div style={{ padding: 80, textAlign: 'center', color: 'var(--stone)' }}>Loading…</div>}>
            <CollectionGrid isTradeUser={isTradeUser} initialProducts={initialPieces} />
          </Suspense>
        </div>
      </section>

      {/* ── 5. HOW IT WORKS ──────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(72px, 10vw, 112px) 0',
        background: 'var(--warm-white)',
        borderTop: '1px solid var(--light-line)',
      }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="label label-sage" style={{ marginBottom: 16 }}>How It Works</div>
            <h2 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(26px, 3vw, 40px)',
              fontWeight: 300,
              color: 'var(--forest)',
              letterSpacing: '0',
            }}>
              From brief to installation
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 'clamp(20px, 3vw, 40px)',
          }}>
            {[
              {
                step: 'I',
                title: 'Trade Access',
                body: 'Apply for a verified trade account to unlock pricing, availability and reservation options.',
              },
              {
                step: 'II',
                title: 'Reserve & Specify',
                body: 'Select your piece, confirm unit count, and receive a formal specification pack and quote.',
              },
              {
                step: 'III',
                title: 'Production',
                body: 'Your numbered units enter the production queue. Lead times range from 12–20 weeks per piece.',
              },
              {
                step: 'IV',
                title: 'Certificate & Delivery',
                body: 'Each unit ships with its certificate of edition, Technical Passport, and installation brief.',
              },
            ].map((s, i) => (
              <div key={i} style={{
                padding: 'clamp(24px, 3vw, 40px) clamp(20px, 2.5vw, 32px)',
                borderTop: '2px solid var(--sand)',
                position: 'relative',
              }}>
                <div style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 'clamp(36px, 4vw, 52px)',
                  fontWeight: 300,
                  color: 'var(--sage-bg)',
                  lineHeight: 1,
                  marginBottom: 20,
                  userSelect: 'none',
                }}>
                  {s.step}
                </div>
                <h4 style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--forest)',
                  marginBottom: 12,
                }}>
                  {s.title}
                </h4>
                <p style={{ fontSize: 14, color: 'var(--stone)', lineHeight: 1.75 }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. COMMISSION CTA ────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(72px, 10vw, 112px) 0',
        background: 'var(--forest)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(ellipse at 40% 60%, rgba(196,168,130,0.07) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
        <div className="container" style={{ maxWidth: 600, position: 'relative', zIndex: 1 }}>
          <div className="label" style={{ color: 'rgba(196,168,130,0.6)', marginBottom: 20, letterSpacing: '0.22em' }}>
            Commission
          </div>
          <h2 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(28px, 4vw, 52px)',
            fontWeight: 300,
            color: 'var(--cream)',
            lineHeight: 1.15,
            letterSpacing: '0',
            marginBottom: 20,
          }}>
            Working on something{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--sand)' }}>bespoke?</em>
          </h2>
          <p style={{
            fontSize: 15,
            color: 'rgba(247,243,238,0.55)',
            lineHeight: 1.85,
            marginBottom: 40,
          }}>
            If your project calls for a piece that doesn't yet exist — a specific material,
            dimension, or design language outside the current Collection — we take a limited
            number of commissions each year through our Custom Match service.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/products" className="btn btn-ghost" style={{
              borderColor: 'rgba(196,168,130,0.3)',
              color: 'rgba(247,243,238,0.75)',
            }}>
              Browse The Edit
            </Link>
            <Link href="/trade/apply" className="btn btn-primary" style={{
              background: 'var(--sand)',
              borderColor: 'var(--sand)',
              color: 'var(--forest)',
            }}>
              Enquire About Commission
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}
