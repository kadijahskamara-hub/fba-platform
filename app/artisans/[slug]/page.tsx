import Link from 'next/link'
import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { getFlags } from '@/lib/flags'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const { data } = await supabaseAdmin
    .from('artisans')
    .select('name, short_bio')
    .eq('slug', params.slug)
    .single()
  if (!data) return {}
  return {
    title: `${data.name} — Full Bloom Artelier`,
    description: data.short_bio ?? `Discover the work of ${data.name}, part of the FBA maker network.`,
  }
}

export default async function ArtisanDetailPage({ params }: { params: { slug: string } }) {
  const flags = await getFlags()
  if (!flags.show_artisans) redirect('/coming-soon')

  const { data: artisan } = await supabaseAdmin
    .from('artisans')
    .select('*')
    .eq('slug', params.slug)
    .eq('is_active', true)
    .single()

  if (!artisan) notFound()

  // Fetch products by this artisan
  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, name, slug, images, retail_price, trade_price, price_type, currency, category:categories(name)')
    .eq('artisan_id', artisan.id)
    .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null)
    .limit(8)

  const productList = products ?? []
  const gallery = (artisan.gallery_images as string[]) ?? []

  return (
    <div className="page-body">

      {/* Hero */}
      <section style={{
        position: 'relative',
        height: 480,
        overflow: 'hidden',
        background: 'var(--forest)',
      }}>
        {artisan.profile_image && (
          <Image
            src={artisan.profile_image}
            alt={artisan.name}
            fill
            priority
            style={{ objectFit: 'cover', objectPosition: 'center 30%', opacity: 0.4 }}
          />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(26,43,24,0.9) 0%, rgba(26,43,24,0.3) 100%)',
        }} />
        <div className="container" style={{
          position: 'relative', zIndex: 1,
          height: '100%', display: 'flex', alignItems: 'flex-end', paddingBottom: 60,
        }}>
          <div>
            <Link href="/artisans" style={{
              fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'rgba(196,168,130,0.7)', textDecoration: 'none', display: 'block', marginBottom: 16,
            }}>
              ← All artisans
            </Link>
            {artisan.craft_category && (
              <div className="label" style={{ color: 'var(--sand)', marginBottom: 12 }}>
                {artisan.craft_category}
              </div>
            )}
            <h1 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(36px, 5vw, 60px)',
              fontWeight: 300,
              color: 'var(--cream)',
              letterSpacing: '-0.01em',
              marginBottom: 8,
            }}>
              {artisan.name}
            </h1>
            {artisan.location && (
              <p style={{ fontSize: 13, color: 'rgba(247,243,238,0.6)', letterSpacing: '0.06em' }}>
                {artisan.location}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Bio + details */}
      <section style={{ padding: '72px 0', background: 'var(--cream)' }}>
        <div className="container">
          <div className="fba-grid-sidebar" style={{
            gap: 64,
          }}>
            <div>
              {artisan.bio && (
                <p style={{
                  fontSize: 16,
                  lineHeight: 1.85,
                  color: 'var(--forest)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {artisan.bio}
                </p>
              )}
            </div>
            <aside>
              <div style={{
                background: 'var(--warm-white)',
                border: '1px solid var(--light-line)',
                padding: 32,
              }}>
                <h3 style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 16,
                  fontWeight: 400,
                  color: 'var(--forest)',
                  marginBottom: 20,
                  paddingBottom: 16,
                  borderBottom: '1px solid var(--light-line)',
                }}>
                  Studio details
                </h3>
                <dl style={{ fontSize: 13 }}>
                  {artisan.location && (
                    <>
                      <dt style={{ color: 'var(--stone)', marginBottom: 2, letterSpacing: '0.06em', fontSize: 11, textTransform: 'uppercase' }}>Location</dt>
                      <dd style={{ color: 'var(--forest)', marginBottom: 16, marginLeft: 0 }}>{artisan.location}</dd>
                    </>
                  )}
                  {artisan.craft_category && (
                    <>
                      <dt style={{ color: 'var(--stone)', marginBottom: 2, letterSpacing: '0.06em', fontSize: 11, textTransform: 'uppercase' }}>Craft</dt>
                      <dd style={{ color: 'var(--forest)', marginBottom: 16, marginLeft: 0 }}>{artisan.craft_category}</dd>
                    </>
                  )}
                  {artisan.website && (
                    <>
                      <dt style={{ color: 'var(--stone)', marginBottom: 2, letterSpacing: '0.06em', fontSize: 11, textTransform: 'uppercase' }}>Website</dt>
                      <dd style={{ marginBottom: 16, marginLeft: 0 }}>
                        <a href={artisan.website} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--caramel)', textDecoration: 'none', fontSize: 13 }}>
                          {artisan.website.replace(/^https?:\/\//, '')}
                        </a>
                      </dd>
                    </>
                  )}
                  {artisan.instagram_handle && (
                    <>
                      <dt style={{ color: 'var(--stone)', marginBottom: 2, letterSpacing: '0.06em', fontSize: 11, textTransform: 'uppercase' }}>Instagram</dt>
                      <dd style={{ marginBottom: 16, marginLeft: 0 }}>
                        <a href={`https://instagram.com/${artisan.instagram_handle.replace('@', '')}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--caramel)', textDecoration: 'none', fontSize: 13 }}>
                          {artisan.instagram_handle}
                        </a>
                      </dd>
                    </>
                  )}
                </dl>
                <Link href="/contact" className="btn btn-primary btn-sm" style={{ width: '100%', textAlign: 'center', display: 'block' }}>
                  Enquire about this maker
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Gallery */}
      {gallery.length > 0 && (
        <section style={{ padding: '0 0 80px', background: 'var(--cream)' }}>
          <div className="container">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}>
              {gallery.map((url: string, i: number) => (
                <div key={i} className="img-zoom-wrap" style={{
                  aspectRatio: '4/3',
                  position: 'relative',
                  background: 'var(--sage-light)',
                }}>
                  <Image src={url} alt={`${artisan.name} — ${i + 1}`} fill style={{ objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Products by this artisan */}
      {productList.length > 0 && (
        <section style={{
          padding: '80px 0',
          background: 'var(--warm-white)',
          borderTop: '1px solid var(--light-line)',
        }}>
          <div className="container">
            <h2 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 32,
              fontWeight: 300,
              color: 'var(--forest)',
              marginBottom: 40,
              letterSpacing: '-0.01em',
            }}>
              Pieces by {artisan.name}
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 24,
            }}>
              {productList.map((p: Record<string, unknown>) => (
                <Link key={p.id as string} href={`/products/${p.slug}`} style={{ textDecoration: 'none' }}>
                  <div className="hover-lift">
                    <div className="img-zoom-wrap" style={{
                      aspectRatio: '3/4',
                      position: 'relative',
                      background: 'var(--sage-light)',
                      marginBottom: 14,
                    }}>
                      {(p.images as string[])?.[0] && (
                        <Image
                          src={(p.images as string[])[0]}
                          alt={p.name as string}
                          fill
                          style={{ objectFit: 'cover' }}
                        />
                      )}
                    </div>
                    <div className="label label-sage" style={{ marginBottom: 6 }}>
                      {(p.category as Record<string, string> | null)?.name ?? ''}
                    </div>
                    <h3 style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: 17,
                      fontWeight: 300,
                      color: 'var(--forest)',
                    }}>
                      {p.name as string}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

    </div>
  )
}
