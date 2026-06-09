import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolvePrice } from '@/lib/pricing'
import { ProductDetailClient } from './ProductDetailClient'
import { AddToBagButton } from '@/components/AddToBagButton'
import type { SessionUser } from '@/lib/types'

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data } = await supabase
    .from('products')
    .select('name, seo_title, seo_description, images')
    .eq('slug', params.slug)
    .eq('visibility', 'published')
    .single()

  if (!data) return { title: 'Product not found' }

  return {
    title:       data.seo_title ?? data.name,
    description: data.seo_description ?? `Discover ${data.name} — handcrafted with precision, available through Full Bloom Artelier.`,
    openGraph: { images: data.images?.[0] ? [{ url: data.images[0] }] : [] },
  }
}

export default async function ProductDetailPage({ params }: Props) {
  const session = await getSession()

  const { data: product } = await supabase
    .from('products')
    .select(`
      *,
      category:categories(id, name, slug),
      subcategory:subcategories(id, name, slug),
      artisan:artisans(id, name, slug, location, bio, profile_image, craft_category),
      specifications:product_specifications(*)
    `)
    .eq('slug', params.slug)
    .eq('visibility', 'published')
    .single()

  if (!product) notFound()

  // Fetch related products (same category, excluding current)
  const { data: related } = await supabase
    .from('products')
    .select('id, name, slug, images, retail_price, trade_price, price_type, currency, artisan:artisans(name, slug), category:categories(name)')
    .eq('visibility', 'published')
    .eq('category_id', product.category_id)
    .neq('id', product.id)
    .limit(4)

  const price = resolvePrice(product, session)
  const specs = product.specifications

  return (
    <div className="page-body">
      {/* Breadcrumb */}
      <div className="container" style={{ paddingTop: 32 }}>
        <nav className="breadcrumb">
          <Link href="/">Home</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href="/products">The Edit</Link>
          {product.category && (
            <>
              <span className="breadcrumb-sep">›</span>
              <Link href={`/products?category=${product.category.slug}`}>{product.category.name}</Link>
            </>
          )}
          <span className="breadcrumb-sep">›</span>
          <span style={{ color: 'var(--forest)' }}>{product.name}</span>
        </nav>
      </div>

      {/* Product layout */}
      <div className="container" style={{ paddingBottom: 80 }}>
        <div className="fba-grid-2" style={{ gap: 80 }}>

          {/* Left: Image gallery */}
          <ProductDetailClient product={product} />

          {/* Right: Product info */}
          <div style={{ paddingTop: 8 }}>
            {product.artisan && (
              <Link href={`/artisans/${product.artisan.slug}`}
                className="label label-sand"
                style={{ display: 'inline-block', marginBottom: 12 }}>
                {product.artisan.name}
                {product.artisan.location && ` — ${product.artisan.location}`}
              </Link>
            )}

            <h1 className="h1" style={{ marginBottom: 8 }}>{product.name}</h1>

            {product.referenceCode && (
              <p style={{ fontSize: 12, color: 'var(--stone)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>
                Ref: {product.referenceCode}
              </p>
            )}

            {/* Price */}
            <div style={{ marginBottom: 32, padding: '20px 0', borderTop: '1px solid var(--light-line)', borderBottom: '1px solid var(--light-line)' }}>
              {price.type === 'fixed' ? (
                <div>
                  <div style={{ fontSize: 28, fontWeight: 500, color: session?.role === 'trade_user' ? 'var(--caramel)' : 'var(--forest)' }}>
                    {price.label}
                  </div>
                  {(session?.role === 'trade_user' || session?.role === 'admin') && (
                    <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
                      color: 'var(--caramel)', marginTop: 4 }}>
                      Trade price
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 18, fontStyle: 'italic', color: 'var(--stone)' }}>Price on request</div>
                  <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 4 }}>
                    Contact us for pricing on this piece
                  </p>
                </div>
              )}
            </div>

            {/* Short description */}
            {product.short_description && (
              <p className="body" style={{ marginBottom: 28, color: 'var(--stone)' }}>
                {product.short_description}
              </p>
            )}

            {/* Key spec highlights */}
            {specs && (
              <div style={{ marginBottom: 32 }}>
                {specs.dimensions_summary && (
                  <div className="qv-spec-row">
                    <span className="qv-spec-label">Dimensions</span>
                    <span>{specs.dimensions_summary}</span>
                  </div>
                )}
                {specs.material && (
                  <div className="qv-spec-row">
                    <span className="qv-spec-label">Material</span>
                    <span>{specs.material}</span>
                  </div>
                )}
                {specs.finish && (
                  <div className="qv-spec-row">
                    <span className="qv-spec-label">Finish</span>
                    <span>{specs.finish}</span>
                  </div>
                )}
                {specs.fabric && (
                  <div className="qv-spec-row">
                    <span className="qv-spec-label">Fabric</span>
                    <span>{specs.fabric}{specs.com_available ? ' — COM available' : ''}</span>
                  </div>
                )}
                {product.lead_time && (
                  <div className="qv-spec-row">
                    <span className="qv-spec-label">Lead time</span>
                    <span>{product.lead_time}</span>
                  </div>
                )}
                {product.shipping_origin && (
                  <div className="qv-spec-row">
                    <span className="qv-spec-label">Origin</span>
                    <span>{product.shipping_origin}</span>
                  </div>
                )}
              </div>
            )}

            {/* CTAs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
              {price.type === 'fixed' && product.audience !== 'trade' ? (
                <AddToBagButton product={product} price={price} />
              ) : (
                <Link href={`/quote?product=${product.id}`} className="btn btn-primary btn-full btn-lg">
                  Request Quote
                </Link>
              )}
              <SaveToProjectButton product={product} session={session} />
              <a
                href={`/api/products/${product.slug}/tear-sheet`}
                className="btn btn-ghost btn-full"
                download={`FBA-${product.referenceCode ?? product.slug}.pdf`}
              >
                ↓ Download Tear Sheet
              </a>
            </div>

            {/* Artisan mini-profile */}
            {product.artisan && (
              <div style={{ padding: 24, background: 'var(--cream)', border: '1px solid var(--light-line)' }}>
                <div className="label label-sage" style={{ marginBottom: 12 }}>The Artisan</div>
                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                  {product.artisan.profile_image && (
                    <div style={{ width: 64, height: 64, flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
                      <Image src={product.artisan.profile_image} alt={product.artisan.name} fill style={{ objectFit: 'cover' }} />
                    </div>
                  )}
                  <div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, marginBottom: 6 }}>{product.artisan.name}</div>
                    {product.artisan.location && (
                      <div style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 10 }}>{product.artisan.location}</div>
                    )}
                    <p style={{ fontSize: 13, color: 'var(--stone)', lineHeight: 1.6, marginBottom: 12 }}>
                      {product.artisan.bio?.substring(0, 160)}…
                    </p>
                    <Link href={`/artisans/${product.artisan.slug}`} style={{ fontSize: 12, color: 'var(--caramel)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Discover the artisan →
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Full description */}
        <div className="divider-lg" />
        <div className="fba-grid-2" style={{ gap: 80 }}>
          <div>
            <div className="label label-sage" style={{ marginBottom: 20 }}>About this piece</div>
            <div style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--stone)', whiteSpace: 'pre-wrap' }}>
              {product.description}
            </div>
          </div>

          {/* Full specification table */}
          {specs && (
            <div>
              <div className="label label-sage" style={{ marginBottom: 20 }}>Full Specification</div>
              <table className="data-table" style={{ fontSize: 13 }}>
                <tbody>
                  {specs.width_mm   && <SpecRow label="Width"   value={`${specs.width_mm}mm`} />}
                  {specs.depth_mm   && <SpecRow label="Depth"   value={`${specs.depth_mm}mm`} />}
                  {specs.height_mm  && <SpecRow label="Height"  value={`${specs.height_mm}mm`} />}
                  {specs.seat_height_mm && <SpecRow label="Seat height" value={`${specs.seat_height_mm}mm`} />}
                  {specs.diameter_mm    && <SpecRow label="Diameter"    value={`${specs.diameter_mm}mm`} />}
                  {specs.weight_kg      && <SpecRow label="Weight"      value={`${specs.weight_kg}kg`} />}
                  {specs.material       && <SpecRow label="Material"    value={specs.material} />}
                  {specs.finish         && <SpecRow label="Finish"      value={specs.finish} />}
                  {specs.fabric         && <SpecRow label="Fabric"      value={specs.fabric} />}
                  {specs.com_available  && <SpecRow label="COM"         value="Available" />}
                  {specs.care_instructions && <SpecRow label="Care"     value={specs.care_instructions} />}
                  {/* Lighting */}
                  {specs.bulb_type   && <SpecRow label="Bulb type"   value={specs.bulb_type} />}
                  {specs.wattage     && <SpecRow label="Wattage"     value={specs.wattage} />}
                  {specs.voltage     && <SpecRow label="Voltage"     value={specs.voltage} />}
                  {specs.ip_rating   && <SpecRow label="IP rating"   value={specs.ip_rating} />}
                  {typeof specs.dimmable === 'boolean' && <SpecRow label="Dimmable" value={specs.dimmable ? 'Yes' : 'No'} />}
                  {product.shipping_notes && <SpecRow label="Shipping" value={product.shipping_notes} />}
                </tbody>
              </table>
              {specs.technical_notes && (
                <div style={{ marginTop: 16, padding: 16, background: 'var(--sage-light)', fontSize: 12, color: 'var(--stone)' }}>
                  <strong style={{ color: 'var(--forest)', display: 'block', marginBottom: 6 }}>Technical Passport™</strong>
                  {specs.technical_notes}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Related products */}
        {related && related.length > 0 && (
          <>
            <div className="divider-lg" />
            <div>
              <div className="label label-sage" style={{ marginBottom: 24 }}>More from this category</div>
              <div className="grid-4">
                {related.map((rp: Record<string, unknown>) => (
                  <Link key={rp.id as string} href={`/products/${rp.slug}`}
                    style={{ display: 'block' }}>
                    <div className="product-card">
                      <div className="product-card-image">
                        <Image
                          src={(rp.images as string[])?.[0] ?? `https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?auto=compress&cs=tinysrgb&w=600`}
                          alt={rp.name as string} fill style={{ objectFit: 'cover' }} sizes="25vw"
                        />
                      </div>
                      <div className="product-card-meta">
                        <div className="product-card-name">{rp.name as string}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* JSON-LD product schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context':  'https://schema.org',
            '@type':     'Product',
            name:        product.name,
            description: product.description.substring(0, 200),
            image:       product.images?.[0],
            brand:       { '@type': 'Brand', name: product.artisan?.name ?? 'Full Bloom Artelier' },
            sku:         product.sku ?? product.reference_code,
            offers: {
              '@type':       'Offer',
              priceCurrency: product.currency,
              price:         product.retail_price ?? 0,
              availability:  'https://schema.org/InStock',
              seller:        { '@type': 'Organization', name: 'Full Bloom Artelier' },
            },
          }),
        }}
      />
    </div>
  )
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ fontWeight: 500, width: '40%', fontSize: 12, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</td>
      <td>{value}</td>
    </tr>
  )
}

function SaveToProjectButton({ product, session }: { product: Record<string,unknown>; session: SessionUser | null }) {
  if (!session) {
    return (
      <Link href={`/login?next=/products/${product.slug}`} className="btn btn-secondary btn-full">
        Sign in to Save to Project
      </Link>
    )
  }
  return (
    <Link href={`/account/projects?add=${product.id as string}`} className="btn btn-secondary btn-full">
      Save to Project
    </Link>
  )
}
