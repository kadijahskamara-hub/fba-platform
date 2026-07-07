import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { getFlags } from '@/lib/flags'
import { HeroImageOverlay } from '@/components/HeroImageOverlay'

export const metadata = {
  title: 'The Journal',
  alternates: { canonical: '/journal' },
  description: 'Thinking, making, and finding — stories from the studio, the makers we work with, and the projects we love.',
}

async function getHeroImage(key: string, fallbackAlt: string) {
  const { data } = await supabaseAdmin.from('site_settings').select('value').eq('key', key).single()
  const val = data?.value as { url?: string; alt?: string } | null
  return { url: val?.url ?? '', alt: val?.alt ?? fallbackAlt }
}

export default async function JournalPage() {
  const flags = await getFlags()
  if (!flags.show_journal) redirect('/coming-soon')

  const [heroImage, { data: posts }] = await Promise.all([
    getHeroImage('journal_hero_image', 'FBA Journal — Ideas, process and craft'),
    supabaseAdmin
      .from('journal_posts')
      .select('id, title, slug, excerpt, featured_image, category, published_at, tags')
      .eq('status', 'published')
      .order('published_at', { ascending: false }),
  ])

  const list = posts ?? []
  const [featured, ...rest] = list

  return (
    <div className="page-body">

      {/* Header */}
      <section style={{
        background: 'var(--forest)',
        padding: 'clamp(80px, 10vw, 120px) 0 clamp(64px, 8vw, 80px)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <HeroImageOverlay url={heroImage.url} />
        <div className="container" style={{ maxWidth: 560, position: 'relative', zIndex: 2 }}>
          <div className="label" style={{ color: 'rgba(196,168,130,0.7)', marginBottom: 16 }}>
            Thinking &amp; making
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
            The Journal
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(247,243,238,0.82)', lineHeight: 1.85, letterSpacing: '0.01em' }}>
            Stories from the studio — the makers we work with, the projects we love,
            and the ideas that shape how we think about craft and interiors.
          </p>
        </div>
      </section>

      {list.length === 0 ? (
        <section style={{ padding: 'clamp(48px, 5vw, 64px) 0', textAlign: 'center' }}>
          <div className="container">
            <p style={{ color: 'var(--stone)', fontSize: 15 }}>
              Journal posts coming soon.
            </p>
          </div>
        </section>
      ) : (
        <>
          {/* Featured post */}
          {!!featured && (
            <section style={{ padding: 'clamp(48px, 5vw, 64px) 0', background: 'var(--cream)' }}>
              <div className="container">
                <Link href={`/journal/${(featured as Record<string, unknown>).slug}`} style={{ textDecoration: 'none' }}>
                  <div className="fba-grid-2" style={{
                    gap: 48,
                    alignItems: 'center',
                  }}>
                    <div className="img-zoom-wrap" style={{
                      aspectRatio: '4/3',
                      position: 'relative',
                      background: 'var(--sage-light)',
                    }}>
                      {!!(featured as Record<string, unknown>).featured_image && (
                        <Image
                          src={(featured as Record<string, unknown>).featured_image as string}
                          alt={(featured as Record<string, unknown>).title as string}
                          fill
                          style={{ objectFit: 'cover' }}
                        />
                      )}
                    </div>
                    <div>
                      {!!(featured as Record<string, unknown>).category && (
                        <div className="label label-sage" style={{ marginBottom: 16 }}>
                          {(featured as Record<string, unknown>).category as string}
                        </div>
                      )}
                      <h2 style={{
                        fontFamily: 'var(--font-serif)',
                        fontSize: 'clamp(28px, 3vw, 42px)',
                        fontWeight: 300,
                        color: 'var(--forest)',
                        letterSpacing: '0',
                        marginBottom: 16,
                        lineHeight: 1.2,
                      }}>
                        {(featured as Record<string, unknown>).title as string}
                      </h2>
                      {!!(featured as Record<string, unknown>).excerpt && (
                        <p style={{
                          fontSize: 15,
                          color: 'var(--stone)',
                          lineHeight: 1.75,
                          marginBottom: 28,
                        }}>
                          {(featured as Record<string, unknown>).excerpt as string}
                        </p>
                      )}
                      {!!(featured as Record<string, unknown>).published_at && (
                        <time style={{
                          fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
                          color: 'var(--stone)', display: 'block', marginBottom: 24,
                        }}>
                          {new Date((featured as Record<string, unknown>).published_at as string).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'long', year: 'numeric',
                          })}
                        </time>
                      )}
                      <span style={{
                        fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: 'var(--caramel)',
                      }}>
                        Read more →
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
            </section>
          )}

          {/* Rest of posts */}
          {rest.length > 0 && (
            <section style={{
              padding: '0 0 96px',
              background: 'var(--cream)',
              borderTop: featured ? '1px solid var(--light-line)' : 'none',
              paddingTop: featured ? 72 : 0,
            }}>
              <div className="container">
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 40,
                }}>
                  {rest.map((post: Record<string, unknown>) => (
                    <Link key={post.id as string} href={`/journal/${post.slug}`} style={{ textDecoration: 'none' }}>
                      <article>
                        <div className="img-zoom-wrap" style={{
                          height: 220,
                          position: 'relative',
                          background: 'var(--sage-light)',
                          marginBottom: 20,
                        }}>
                          {!!post.featured_image && (
                            <Image
                              src={post.featured_image as string}
                              alt={post.title as string}
                              fill
                              style={{ objectFit: 'cover' }}
                            />
                          )}
                        </div>
                        {!!post.category && (
                          <div className="label label-sage" style={{ marginBottom: 10 }}>
                            {post.category as string}
                          </div>
                        )}
                        <h3 style={{
                          fontFamily: 'var(--font-serif)',
                          fontSize: 22,
                          fontWeight: 300,
                          color: 'var(--forest)',
                          marginBottom: 10,
                          lineHeight: 1.3,
                        }}>
                          {post.title as string}
                        </h3>
                        {!!post.excerpt && (
                          <p style={{
                            fontSize: 13,
                            color: 'var(--stone)',
                            lineHeight: 1.65,
                            marginBottom: 14,
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical' as const,
                            overflow: 'hidden',
                          }}>
                            {post.excerpt as string}
                          </p>
                        )}
                        {!!post.published_at && (
                          <time style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--stone)', textTransform: 'uppercase' }}>
                            {new Date(post.published_at as string).toLocaleDateString('en-GB', {
                              day: 'numeric', month: 'long', year: 'numeric',
                            })}
                          </time>
                        )}
                      </article>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}

    </div>
  )
}
