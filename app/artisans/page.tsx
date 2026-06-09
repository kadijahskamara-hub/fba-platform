import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { getFlags } from '@/lib/flags'
import { HeroImageOverlay } from '@/components/HeroImageOverlay'

export const metadata = {
  title: 'Our Artisans — Full Bloom Artelier',
  description: 'Meet the makers and studios behind the FBA network — craftspeople from around the world creating exceptional furniture, lighting and objects.',
}

async function getHeroImage(key: string, fallbackAlt: string) {
  const { data } = await supabaseAdmin.from('site_settings').select('value').eq('key', key).single()
  const val = data?.value as { url?: string; alt?: string } | null
  return { url: val?.url ?? '', alt: val?.alt ?? fallbackAlt }
}

export default async function ArtisansPage() {
  const flags = await getFlags()
  if (!flags.show_artisans) redirect('/coming-soon')

  const [heroImage, { data: artisans }] = await Promise.all([
    getHeroImage('artisans_hero_image', 'Our artisan maker network'),
    supabaseAdmin
      .from('artisans')
      .select('id, name, slug, location, craft_category, profile_image, short_bio, is_active')
      .eq('is_active', true)
      .order('name'),
  ])

  const list = artisans ?? []

  return (
    <div className="page-body">

      {/* Hero */}
      <section style={{
        background: 'var(--forest)',
        padding: '72px 0 52px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <HeroImageOverlay url={heroImage.url} />
        <div className="container" style={{ maxWidth: 640, position: 'relative', zIndex: 2 }}>
          <div className="label" style={{ color: 'rgba(196,168,130,0.7)', marginBottom: 16 }}>
            Our maker network
          </div>
          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(36px, 5vw, 60px)',
            fontWeight: 300,
            color: 'var(--cream)',
            letterSpacing: '-0.01em',
            lineHeight: 1.02,
            marginBottom: 32,
          }}>
            The artisans behind the work
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(247,243,238,0.82)', lineHeight: 1.85, letterSpacing: '0.01em' }}>
            Every piece we procure is made by hand, by skilled craftspeople with a deep
            knowledge of material and form. These are the studios we trust.
          </p>
        </div>
      </section>

      {/* Grid */}
      <section style={{ padding: 'clamp(48px, 5vw, 64px) 0', background: 'var(--cream)' }}>
        <div className="container">
          {list.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'clamp(48px, 5vw, 64px) 0' }}>
              <p style={{ color: 'var(--stone)', fontSize: 15 }}>
                Artisan profiles coming soon.
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 32,
            }}>
              {list.map((a: Record<string, unknown>) => (
                <Link
                  key={a.id as string}
                  href={`/artisans/${a.slug}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div className="hover-lift" style={{
                    background: 'var(--warm-white)',
                    border: '1px solid var(--light-line)',
                    overflow: 'hidden',
                  }}>
                    <div className="img-zoom-wrap" style={{
                      height: 260,
                      position: 'relative',
                      background: 'var(--sage-light)',
                    }}>
                      {a.profile_image ? (
                        <Image
                          src={a.profile_image as string}
                          alt={a.name as string}
                          fill
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{
                          position: 'absolute', inset: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: 11, color: 'var(--stone)', letterSpacing: '0.1em' }}>FBA</span>
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '28px 28px 32px' }}>
                      {!!a.craft_category && (
                        <div className="label label-sage" style={{ marginBottom: 10 }}>
                          {a.craft_category as string}
                        </div>
                      )}
                      <h2 style={{
                        fontFamily: 'var(--font-serif)',
                        fontSize: 22,
                        fontWeight: 300,
                        color: 'var(--forest)',
                        marginBottom: 6,
                      }}>
                        {a.name as string}
                      </h2>
                      {!!a.location && (
                        <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 14, letterSpacing: '0.04em' }}>
                          {a.location as string}
                        </p>
                      )}
                      {!!a.short_bio && (
                        <p style={{
                          fontSize: 13,
                          color: 'var(--stone)',
                          lineHeight: 1.65,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical' as const,
                          overflow: 'hidden',
                        }}>
                          {a.short_bio as string}
                        </p>
                      )}
                      <div style={{
                        marginTop: 20,
                        fontSize: 11,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'var(--caramel)',
                      }}>
                        View profile →
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

    </div>
  )
}
