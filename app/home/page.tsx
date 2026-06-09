import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { getFlags } from '@/lib/flags'
import { resolvePrice, formatPrice } from '@/lib/pricing'
import type { CurrencyCode } from '@/lib/types'

export const metadata = {
  title: 'FBA Home — Full Bloom Artelier',
  description:
    'Curated home pieces — furniture, lighting and objects selected by Full Bloom Artelier for residential living. Available to retail and trade clients.',
}

// ─── Data ────────────────────────────────────────────────────────────────────

async function getHomeProducts(isTradeUser: boolean) {
  const { data } = await supabaseAdmin
    .from('products')
    .select(`
      id, name, slug, images, short_description,
      retail_price, trade_price, price_type, currency,
      audience, is_fba_home,
      artisan:artisans(name, slug),
      category:categories(name, slug)
    `)
    .eq('visibility', 'published')
    .eq('is_fba_home', true)
    .order('created_at', { ascending: false })

  // Audience gating
  const products = (data ?? []).filter((p: Record<string, unknown>) => {
    if (p.audience === 'trade' && !isTradeUser) return false
    return true
  })

  return products
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function FbaHomePage() {
  const flags = await getFlags()
  if (!flags.show_home) redirect('/coming-soon')

  const session     = await getSession()
  const isTradeUser = ['trade_user', 'admin', 'staff'].includes(session?.role ?? '')
  const products    = await getHomeProducts(isTradeUser)

  return (
    <div className="page-body">

      {/* ── 1. HERO ─────────────────────────────────────────────── */}
      <section style={{
        background: 'var(--sand)',
        padding: 'clamp(80px, 10vw, 120px) 0 clamp(64px, 8vw, 80px)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(ellipse at 60% 40%, rgba(62,82,60,0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div className="container" style={{ maxWidth: 680, position: 'relative', zIndex: 1 }}>
          <div className="label" style={{ color: 'rgba(62,82,60,0.55)', marginBottom: 24, letterSpacing: '0.22em' }}>
            FBA Home · Curated Living
          </div>

          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(36px, 5vw, 60px)',
            fontWeight: 300,
            color: 'var(--forest)',
            letterSpacing: '-0.02em',
            lineHeight: 1.02,
            marginBottom: 32,
          }}>
            Considered pieces<br />for the home
          </h1>

          <p style={{
            fontSize: 15,
            color: 'rgba(62,82,60,0.82)',
            lineHeight: 1.85,
            letterSpacing: '0.01em',
            marginBottom: 48,
            maxWidth: 520,
            margin: '0 auto 48px',
          }}>
            FBA Home is our edit of furniture, lighting and objects suited to residential living —
            selected with the same rigour we apply to contract procurement, but scaled and
            specified for the home.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#pieces" className="btn btn-primary" style={{
              background: 'var(--forest)',
              color: 'var(--cream)',
              borderColor: 'var(--forest)',
            }}>
              Browse FBA Home
            </a>
            <Link href="/products" className="btn btn-ghost" style={{
              borderColor: 'rgba(62,82,60,0.35)',
              color: 'var(--forest)',
            }}>
              Explore The Edit
            </Link>
          </div>
        </div>
      </section>

      {/* ── 2. EDITORIAL STRIP ──────────────────────────────────── */}
      <section style={{
        background: 'var(--warm-white)',
        borderTop: '1px solid var(--light-line)',
        borderBottom: '1px solid var(--light-line)',
        padding: 'clamp(48px, 7vw, 80px) 0',
      }}>
        <div className="container">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'clamp(28px, 4vw, 56px)',
            textAlign: 'center',
          }}>
            {[
              {
                icon: '◇',
                title: 'Sourced with intention',
                body: 'Every piece is assessed for material quality, maker provenance and long-term living — not just visual appeal.',
              },
              {
                icon: '○',
                title: 'Retail & trade',
                body: 'FBA Home pieces are available to individual clients and specifiers alike, with trade pricing on request.',
              },
              {
                icon: '△',
                title: 'Specification support',
                body: 'Each piece carries a full Technical Passport — dimensions, materials, care and lead times — ready to use in project docs.',
              },
            ].map((item, i) => (
              <div key={i} style={{ padding: 'clamp(16px, 2vw, 24px)' }}>
                <div style={{
                  fontSize: 22,
                  color: 'var(--sage)',
                  marginBottom: 16,
                  lineHeight: 1,
                }}>
                  {item.icon}
                </div>
                <h3 style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: 'var(--forest)',
                  marginBottom: 12,
                }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--stone)', lineHeight: 1.75 }}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. PRODUCT GRID ──────────────────────────────────────── */}
      <section id="pieces" style={{
        padding: 'clamp(72px, 10vw, 112px) 0',
        background: 'var(--cream)',
      }}>
        <div className="container">
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
                FBA Home Edit
              </h2>
              {products.length > 0 && (
                <p style={{ fontSize: 13, color: 'var(--stone)' }}>
                  {products.length} {products.length === 1 ? 'piece' : 'pieces'} available now
                </p>
              )}
            </div>
          </div>

          {products.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: 'clamp(60px, 8vw, 96px) 0',
              border: '1px solid var(--light-line)',
              background: 'var(--warm-white)',
            }}>
              <div style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 22,
                fontWeight: 300,
                color: 'var(--forest)',
                marginBottom: 12,
              }}>
                Coming soon
              </div>
              <p style={{ fontSize: 14, color: 'var(--stone)', maxWidth: 380, margin: '0 auto 28px', lineHeight: 1.7 }}>
                The FBA Home edit is being assembled. Check back shortly or browse The Edit for the full catalogue.
              </p>
              <Link href="/products" className="btn btn-primary">Browse The Edit</Link>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 'clamp(20px, 3vw, 36px)',
            }}>
              {products.map((p: Record<string, unknown>) => {
                const pricing = resolvePrice(p as Parameters<typeof resolvePrice>[0], session)
                const img     = (p.images as string[])?.[0]

                return (
                  <Link
                    key={p.id as string}
                    href={`/products/${p.slug}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <article className="hover-lift" style={{ cursor: 'pointer' }}>
                      {/* Image */}
                      <div className="img-zoom-wrap" style={{
                        aspectRatio: '3/4',
                        position: 'relative',
                        background: 'var(--sage-light)',
                        marginBottom: 18,
                        overflow: 'hidden',
                      }}>
                        {img ? (
                          <Image
                            src={img}
                            alt={p.name as string}
                            fill
                            style={{ objectFit: 'cover' }}
                            sizes="(max-width: 768px) 100vw, 33vw"
                          />
                        ) : (
                          <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={{ fontSize: 11, color: 'var(--stone)', letterSpacing: '0.15em' }}>FBA</span>
                          </div>
                        )}

                        {/* Badge */}
                        <div style={{
                          position: 'absolute', top: 12, left: 12,
                          background: 'var(--sand)',
                          color: 'var(--forest)',
                          fontSize: 9, fontWeight: 600,
                          letterSpacing: '0.2em', textTransform: 'uppercase',
                          padding: '5px 10px',
                          zIndex: 2,
                        }}>
                          FBA Home
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="label label-sage" style={{ marginBottom: 6 }}>
                        {(p.category as Record<string, string> | null)?.name ?? ''}
                      </div>
                      <h3 style={{
                        fontFamily: 'var(--font-serif)',
                        fontSize: 20, fontWeight: 300,
                        color: 'var(--forest)', marginBottom: 4, lineHeight: 1.25,
                      }}>
                        {p.name as string}
                      </h3>
                      <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 10 }}>
                        by {(p.artisan as Record<string, string> | null)?.name ?? 'Unknown maker'}
                      </p>
                      {(p.short_description as string) && (
                        <p style={{ fontSize: 13, color: 'var(--stone)', lineHeight: 1.65, marginBottom: 10 }}>
                          {(p.short_description as string).slice(0, 90)}{(p.short_description as string).length > 90 ? '…' : ''}
                        </p>
                      )}
                      <p style={{
                        fontSize: 14,
                        color: pricing.type === 'fixed' ? 'var(--caramel)' : 'var(--stone)',
                        fontWeight: 500,
                      }}>
                        {pricing.type === 'fixed'
                          ? formatPrice(pricing.amount, p.currency as CurrencyCode)
                          : 'Price on request'}
                      </p>
                    </article>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── 4. CROSS-SELL CTA ────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(72px, 10vw, 112px) 0',
        background: 'var(--forest)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(ellipse at 60% 40%, rgba(196,168,130,0.06) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
        <div className="container" style={{ maxWidth: 580, position: 'relative', zIndex: 1 }}>
          <div className="label" style={{ color: 'rgba(196,168,130,0.6)', marginBottom: 20, letterSpacing: '0.22em' }}>
            Explore Further
          </div>
          <h2 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(28px, 4vw, 48px)',
            fontWeight: 300,
            color: 'var(--cream)',
            lineHeight: 1.15,
            letterSpacing: '0',
            marginBottom: 20,
          }}>
            Looking for something{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--sand)' }}>for a project?</em>
          </h2>
          <p style={{
            fontSize: 15,
            color: 'rgba(247,243,238,0.55)',
            lineHeight: 1.85,
            marginBottom: 40,
          }}>
            The Edit is our full FF&amp;E sourcing catalogue — thousands of pieces from vetted
            maker studios, with Technical Passports and trade pricing for specifiers.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/products" className="btn btn-primary" style={{
              background: 'var(--sand)', borderColor: 'var(--sand)', color: 'var(--forest)',
            }}>
              Browse The Edit
            </Link>
            <Link href="/collection" className="btn btn-ghost" style={{
              borderColor: 'rgba(196,168,130,0.3)', color: 'rgba(247,243,238,0.75)',
            }}>
              FBA Collection
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}
