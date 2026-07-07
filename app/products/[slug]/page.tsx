import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolvePrice } from '@/lib/pricing'
import { ProductDetailClient } from './ProductDetailClient'
import { AddToBagButton } from '@/components/AddToBagButton'
import ProductConfigurator, { type FinishOption, type SizeOption } from './ProductConfigurator'

interface Props {
  params: { slug: string }
}

const DEFAULT_SHIPPING_NOTE =
  'If you need more details regarding this item please feel free to contact us at info@fullbloom.uk.com. Please note that delivery times may be longer for shipping outside of the UK.'

const DOC_LABELS: Record<string, string> = {
  product_specification: 'Download Product Specification',
  upholstery_program:    'Download Upholstery Program',
  material_finishes:     'Download Material & Finishes',
  care_maintenance:      'Download Care & Maintenance',
  installation_guide:    'Download Installation Guide',
  technical_passport:    'Download Technical Passport™',
  warranty:              'Download Warranty',
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data } = await supabase
    .from('products')
    .select('name, seo_title, seo_description, images')
    .eq('slug', params.slug)
    .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null)
    .single()

  if (!data) return { title: 'Product not found' }

  return {
    title:       data.seo_title ?? data.name,
    description: data.seo_description ?? `Discover ${data.name} — handcrafted with precision, available through Full Bloom Artelier.`,
    alternates:  { canonical: `/products/${params.slug}` },
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
      artisan:artisans(id, name, slug, location),
      specifications:product_specifications(*)
    `)
    .eq('slug', params.slug)
    .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null)
    .single()

  if (!product) notFound()

  // Documents, finishes, variants + related — RLS limits these to published products
  const [{ data: documents }, { data: finishes }, { data: variants }, { data: related }] = await Promise.all([
    supabase.from('product_documents').select('*').eq('product_id', product.id).order('sort_order'),
    supabase.from('product_finishes').select('*').eq('product_id', product.id).order('sort_order'),
    supabase.from('product_variants').select('*').eq('product_id', product.id).order('sort_order'),
    supabase
      .from('products')
      .select('id, name, slug, images, price_type, category:categories(name)')
      .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null)
      .eq('category_id', product.category_id)
      .neq('id', product.id)
      .limit(4),
  ])

  const price = resolvePrice(product, session)
  const specs = product.specifications
  // Electrical specs (bulb, wattage, voltage, dimmable) only apply to
  // lighting. `dimmable` is a non-null boolean that defaults to false, so
  // without this gate every table/sofa wrongly showed "Dimmable: No".
  const isLighting = (product.category as { slug?: string } | null)?.slug === 'lighting'

  // Admin can hide the swatch sections per product even when finish rows
  // exist (products.hide_finish_options — see 20260709 migration).
  const finishesHidden = product.hide_finish_options === true
  const hardFinishes: FinishOption[] = finishesHidden ? [] : (finishes ?? [])
    .filter((f: Record<string, unknown>) => f.finish_category === 'hard_finish')
    .map(mapFinish)
  const upholstery: FinishOption[] = finishesHidden ? [] : (finishes ?? [])
    .filter((f: Record<string, unknown>) => f.finish_category === 'upholstery')
    .map(mapFinish)
  const sizes: SizeOption[] = (variants ?? []).map((v: Record<string, unknown>) => ({
    id: v.id as string,
    variantName: v.variant_name as string,
    available: v.availability !== 'unavailable',
    leadTimeOverride: (v.lead_time_override as string | null) ?? null,
  }))

  // One fulfilment line near the price (never repeated)
  const dispatchLine = product.made_to_order
    ? `Made to order${product.dispatch_time_label ? ` · Dispatched within ${product.dispatch_time_label}` : product.lead_time ? ` · Lead time ${product.lead_time}` : ''}`
    : product.dispatch_time_label
      ? `Dispatched within ${product.dispatch_time_label}`
      : product.lead_time
        ? `Lead time ${product.lead_time}`
        : null

  const showBrand = product.public_brand_visible === true && product.artisan

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
            {product.category && (
              <div className="label label-sand" style={{ marginBottom: 10 }}>
                {product.category.name}
              </div>
            )}

            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 300, lineHeight: 1.25, marginBottom: 6 }}>
              {product.name}
            </h1>

            {showBrand && (
              <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 8 }}>
                {product.artisan.name}{product.artisan.location ? ` — ${product.artisan.location}` : ''}
              </p>
            )}

            {product.reference_code && (
              <p style={{ fontSize: 11, color: 'var(--stone)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
                Ref: {product.reference_code}
              </p>
            )}

            {/* Price + fulfilment */}
            <div style={{ marginBottom: 28, padding: '16px 0', borderTop: '1px solid var(--light-line)', borderBottom: '1px solid var(--light-line)' }}>
              {price.type === 'fixed' ? (
                <div>
                  <div style={{ fontSize: 20, fontWeight: 500, color: session?.role === 'trade_user' ? 'var(--caramel)' : 'var(--forest)' }}>
                    {price.label}
                  </div>
                  {(session?.role === 'trade_user' || session?.role === 'admin') && (
                    <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--caramel)', marginTop: 3 }}>
                      Trade price
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 15, fontStyle: 'italic', color: 'var(--stone)' }}>Price on request</div>
              )}
              {dispatchLine && (
                <p style={{ fontSize: 12, color: 'var(--forest)', marginTop: 8, fontWeight: 500 }}>
                  {dispatchLine}
                </p>
              )}
            </div>

            {/* Short description */}
            {product.short_description && (
              <p style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 24, color: 'var(--stone)' }}>
                {product.short_description}
              </p>
            )}

            {/* Key spec highlights */}
            {specs && (
              <div style={{ marginBottom: 26 }}>
                {specs.dimensions_summary && (
                  <div className="qv-spec-row"><span className="qv-spec-label">Dimensions</span><span>{specs.dimensions_summary}</span></div>
                )}
                {specs.material && (
                  <div className="qv-spec-row"><span className="qv-spec-label">Material</span><span>{specs.material}</span></div>
                )}
                {specs.fabric && (
                  <div className="qv-spec-row"><span className="qv-spec-label">Fabric</span><span>{specs.fabric}{specs.com_available ? ' — COM available' : ''}</span></div>
                )}
                {product.shipping_origin && (
                  <div className="qv-spec-row"><span className="qv-spec-label">Origin</span><span>{product.shipping_origin}</span></div>
                )}
              </div>
            )}

            {/* Configurator: finishes / upholstery / sizes / quantity + CTAs */}
            <ProductConfigurator
              productId={product.id}
              slug={product.slug}
              hardFinishes={hardFinishes}
              upholstery={upholstery}
              sizes={sizes}
              isLoggedIn={Boolean(session)}
            />

            {/* Retail purchase (fixed-price retail pieces only) */}
            {price.type === 'fixed' && product.audience !== 'trade' && (
              <div style={{ marginBottom: 24 }}>
                <AddToBagButton product={product} price={price} />
              </div>
            )}

            {/* Downloads — only documents that actually exist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(documents ?? [])
                .filter((d: Record<string, unknown>) => typeof d.url === 'string' && (d.url as string).startsWith('http'))
                .map((d: Record<string, unknown>) => (
                  <a
                    key={d.id as string}
                    href={d.url as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-full"
                  >
                    ↓ {DOC_LABELS[d.document_type as string] ?? (d.label ? `Download ${d.label}` : 'Download Document')}
                  </a>
                ))}
              <a
                href={`/api/products/${product.slug}/tear-sheet`}
                className="btn btn-ghost btn-full"
                download={`FBA-${product.reference_code ?? product.slug}.pdf`}
              >
                ↓ Download Tear Sheet
              </a>
            </div>
          </div>
        </div>

        {/* Technical description + full specification */}
        <div className="divider-lg" />
        <div className="fba-grid-2" style={{ gap: 80 }}>
          <div>
            <div className="label label-sage" style={{ marginBottom: 20 }}>Technical description</div>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--stone)', whiteSpace: 'pre-wrap' }}>
              {product.technical_description || product.description}
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--forest)', marginTop: 20, fontStyle: 'italic' }}>
              {product.customisation_note || 'This item can be customised — contact a member of the team with your requirements to find out what is possible.'}
            </p>
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
                  {isLighting && specs.bulb_type && <SpecRow label="Bulb type" value={specs.bulb_type} />}
                  {isLighting && specs.wattage   && <SpecRow label="Wattage"   value={specs.wattage} />}
                  {isLighting && specs.voltage   && <SpecRow label="Voltage"   value={specs.voltage} />}
                  {specs.ip_rating   && <SpecRow label="IP rating"   value={specs.ip_rating} />}
                  {isLighting && typeof specs.dimmable === 'boolean' && <SpecRow label="Dimmable" value={specs.dimmable ? 'Yes' : 'No'} />}
                </tbody>
              </table>
              {specs.technical_notes && (
                <div style={{ marginTop: 16, padding: 16, background: 'var(--sage-light)', fontSize: 12, color: 'var(--stone)' }}>
                  <strong style={{ color: 'var(--forest)', display: 'block', marginBottom: 6 }}>Technical Passport™</strong>
                  {specs.technical_notes}
                </div>
              )}

              {/* Delivery & notes */}
              <div style={{ marginTop: 24 }}>
                <div className="label label-sage" style={{ marginBottom: 12 }}>Delivery &amp; notes</div>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--stone)' }}>
                  {product.shipping_notes || DEFAULT_SHIPPING_NOTE}
                </p>
              </div>
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
                  <Link key={rp.id as string} href={`/products/${rp.slug}`} style={{ display: 'block' }}>
                    <div className="product-card">
                      <div className="product-card-image">
                        <Image
                          src={(rp.images as string[])?.[0] ?? `https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?auto=compress&cs=tinysrgb&w=600`}
                          alt={rp.name as string} fill style={{ objectFit: 'cover' }} sizes="25vw"
                        />
                      </div>
                      <div className="product-card-meta">
                        {(rp.category as { name?: string } | null)?.name && (
                          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 4 }}>
                            {(rp.category as { name?: string }).name}
                          </div>
                        )}
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
            description: (product.technical_description || product.description).substring(0, 200),
            image:       product.images?.[0],
            brand:       { '@type': 'Brand', name: showBrand ? product.artisan.name : 'Full Bloom Artelier' },
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

function mapFinish(f: Record<string, unknown>): FinishOption {
  return {
    id: f.id as string,
    finishName: f.finish_name as string,
    finishCode: (f.finish_code as string | null) ?? null,
    material: (f.material as string | null) ?? null,
    colour: (f.colour as string | null) ?? null,
    swatchUrl: (f.swatch_url as string | null) ?? null,
    comAccepted: (f.com_accepted as boolean | null) ?? null,
    rubCount: (f.rub_count as number | null) ?? null,
    fireTreatment: (f.fire_treatment as string | null) ?? null,
    available: f.availability !== 'unavailable',
  }
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ fontWeight: 500, width: '40%', fontSize: 12, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</td>
      <td>{value}</td>
    </tr>
  )
}
