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
import CuratedFinishes, { type PublicGroup, type PublicMedia } from './CuratedFinishes'
import LivePrice from './LivePrice'
import CustomMatchLauncher from './CustomMatchLauncher'
import { StickyActionBar } from './StickyActionBar'
import { RecentlyViewed } from './RecentlyViewed'
import { getPublicProductConfiguration } from '@/lib/publicProduct'
import {
  applyCategoryVisibilityFilter,
  bypassesCategoryVisibility,
  getNonPublicCategoryIds,
  productCategoryIsPublic,
} from '@/lib/categoryVisibility'

interface Props {
  params: Promise<{ slug: string }>
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

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const { data } = await supabase
    .from('products')
    .select('name, seo_title, seo_description, images, category_id, category:categories(is_visible, archived_at)')
    .eq('slug', params.slug)
    .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null)
    .single()

  // Spec §5: hidden-category products are 404s, so their real title and
  // description must not surface in the not-found response either.
  if (!data || !productCategoryIsPublic(data)) return { title: 'Product not found' }

  // QA item 10: the root layout template appends "— Full Bloom Artelier".
  // When a custom SEO title already contains the brand, use it verbatim
  // (title.absolute bypasses the template) so it is never doubled.
  const rawTitle: string = data.seo_title ?? data.name
  const title = /full bloom artelier/i.test(rawTitle) ? { absolute: rawTitle } : rawTitle

  return {
    title,
    description: data.seo_description ?? `Discover ${data.name} — handcrafted with precision, available through Full Bloom Artelier.`,
    alternates:  { canonical: `/products/${params.slug}` },
    openGraph: { images: data.images?.[0] ? [{ url: data.images[0] }] : [] },
  }
}

// Final amendments §6: spec rows render only meaningful values —
// blanks and literal "N/A"s never occupy a row.
function sv(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  if (!s || /^n\/?\.?a\.?$/i.test(s)) return null
  return s
}

export default async function ProductDetailPage(props: Props) {
  const params = await props.params
  const session = await getSession()

  const { data: product } = await supabase
    .from('products')
    .select(`
      *,
      category:categories(id, name, slug, is_visible, archived_at),
      subcategory:subcategories(id, name, slug),
      artisan:artisans(id, name, slug, location),
      specifications:product_specifications(*)
    `)
    .eq('slug', params.slug)
    .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null)
    .single()

  if (!product) notFound()

  // Spec §5: a product whose category is hidden or archived is off the
  // public site entirely — including this direct URL. Staff keep access so
  // they can review a hidden piece before re-publishing the category.
  if (!bypassesCategoryVisibility(session?.role) && !productCategoryIsPublic(product)) {
    notFound()
  }

  // Documents, finishes, variants + discovery content — RLS limits
  // these to published products.
  const showBrandForRelated = product.public_brand_visible === true && product.artisan_id

  // Categories excluded from every public surface — applied to the
  // "More from this maker" grid so a hidden piece cannot re-enter there.
  // ("More from this category" is already scoped to this product's own
  // category, which is known public by the gate above.) Only queried when
  // that grid will actually render.
  const hiddenCategoryIds = showBrandForRelated && !bypassesCategoryVisibility(session?.role)
    ? await getNonPublicCategoryIds()
    : []
  const [{ data: documents }, { data: finishes }, { data: variants }, { data: related }, { data: fromArtisan }] = await Promise.all([
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
    // "From the same maker" — only when the maker is publicly credited
    // on this product (final amendments §6).
    showBrandForRelated
      ? applyCategoryVisibilityFilter(
          supabase
            .from('products')
            .select('id, name, slug, images, price_type, category:categories(name)')
            .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null)
            .eq('artisan_id', product.artisan_id)
            .eq('public_brand_visible', true)
            .neq('id', product.id)
            .limit(4),
          hiddenCategoryIds,
          session?.role,
        )
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  // Sprint 12: curated finish groups, structured media, passport and
  // spec rows from the Custom Match data model.
  const configuration = await getPublicProductConfiguration(product.id, session)
  const hasCuratedFinishes = configuration.groups.length > 0 && product.hide_finish_options !== true

  const customMatchSummary = {
    id: product.id as string,
    name: product.name as string,
    sku: (product.reference_code as string | null) ?? null,
    makerName: product.public_brand_visible === true && product.artisan ? (product.artisan.name as string) : null,
    imageUrl: configuration.media.find(m => m.isPrimary)?.url ?? (product.images as string[] | null)?.[0] ?? null,
  }

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

  // Sticky bar essentials — resolved with the viewer's permissions.
  const priceLine = price.type === 'fixed'
    ? `£${Number(price.amount).toLocaleString('en-GB')}`
    : 'Price on request'
  const canBuy = price.type === 'fixed' && product.audience !== 'trade'
  const stickyLabel = canBuy ? 'Configure & order' : 'Configure & enquire'

  // Discovery grids: never show the same piece twice across sections.
  const relatedRows = (related ?? []) as Record<string, unknown>[]
  const relatedIds = new Set(relatedRows.map(r => r.id as string))
  const artisanRows = ((fromArtisan ?? []) as Record<string, unknown>[])
    .filter(r => !relatedIds.has(r.id as string))

  return (
    <div className="page-body no-site-footer">
      {/* Breadcrumb — spec §3: one deliberate spacing value (.pdp-crumbs)
          instead of a 32px container pad stacked on the global 32px
          breadcrumb margin, which left a blank band above the image. */}
      <div className="container pdp-crumbs">
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

      {/* ── Product layout (final amendments §6): media | identity +
          configuration | compact specification. The technical
          description fills the space beneath the media. ── */}
      <div className="container" style={{ paddingBottom: 80 }}>
        <div className="pdp-grid">

          {/* Column 1 — media */}
          <div className="pdp-media">
            <ProductDetailClient product={{ images: product.images ?? [], name: product.name }} media={configuration.media as PublicMedia[]} />
          </div>

          {/* Column 2 — identity, commercial info, configuration, actions */}
          <div className="pdp-centre">
            {product.category && (
              <div className="label label-sand" style={{ marginBottom: 10 }}>
                {product.category.name}
              </div>
            )}

            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(24px, 2.4vw, 30px)', fontWeight: 300, lineHeight: 1.25, marginBottom: 6 }}>
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
            <div style={{ marginBottom: 22, padding: '14px 0', borderTop: '1px solid var(--light-line)', borderBottom: '1px solid var(--light-line)' }}>
              {price.type === 'fixed' ? (
                <div>
                  {/* QA item 7: headline updates live when a finish option
                      with a price adjustment is selected. */}
                  <LivePrice
                    baseAmount={price.amount}
                    currencySymbol={'£'}
                    isTrade={session?.role === 'trade_user'}
                  />
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
              <p style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 20, color: 'var(--stone)' }}>
                {product.short_description}
              </p>
            )}

            {/* Key attribute highlights */}
            {specs && (
              <div style={{ marginBottom: 22 }}>
                {sv(specs.dimensions_summary) && (
                  <div className="qv-spec-row"><span className="qv-spec-label">Dimensions</span><span>{sv(specs.dimensions_summary)}</span></div>
                )}
                {sv(specs.material) && (
                  <div className="qv-spec-row"><span className="qv-spec-label">Material</span><span>{sv(specs.material)}</span></div>
                )}
                {sv(specs.fabric) && (
                  <div className="qv-spec-row"><span className="qv-spec-label">Fabric</span><span>{sv(specs.fabric)}{specs.com_available ? ' — COM available' : ''}</span></div>
                )}
                {sv(product.shipping_origin) && (
                  <div className="qv-spec-row"><span className="qv-spec-label">Origin</span><span>{sv(product.shipping_origin)}</span></div>
                )}
              </div>
            )}

            {/* Configuration + primary actions (sticky-bar anchor) */}
            <div id="pdp-actions">
              {/* Curated finishes (Sprint 12) with legacy fallback */}
              {hasCuratedFinishes ? (
                <CuratedFinishes
                  productId={product.id}
                  groups={configuration.groups as unknown as PublicGroup[]}
                  rules={configuration.rules}
                  media={configuration.media as PublicMedia[]}
                  isLoggedIn={Boolean(session)}
                  currencySymbol={'£'}
                  productSummary={customMatchSummary}
                  materialTypes={configuration.materialTypes}
                  defaultEmail={session?.email ?? null}
                />
              ) : (
                <>
                  <ProductConfigurator
                    productId={product.id}
                    slug={product.slug}
                    hardFinishes={hardFinishes}
                    upholstery={upholstery}
                    sizes={sizes}
                    isLoggedIn={Boolean(session)}
                  />
                  <CustomMatchLauncher
                    product={customMatchSummary}
                    materialTypes={configuration.materialTypes}
                    defaultEmail={session?.email ?? null}
                  />
                </>
              )}

              {/* Retail purchase (fixed-price retail pieces only).
                  Client components receive a SLIM product object — the full
                  row contains internal figures (supplier_cost, trade_price)
                  that must never serialise into client props (md doc §17). */}
              {/* Spec §1: Add to Bag spans the full configuration column
                  beneath Custom Match, and only for pieces that can be
                  bought directly — price-on-request and trade-only pieces
                  keep the Request Quote route with no dead button. */}
              {canBuy && (
                <div style={{ marginTop: 10 }}>
                  <AddToBagButton
                    product={{
                      id: product.id, slug: product.slug, name: product.name,
                      images: product.images ?? [], audience: product.audience,
                      artisan: product.artisan ? { name: product.artisan.name } : null,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    } as any}
                    price={price}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Column 3 — compact structured specification */}
          <div className="pdp-spec">
            {specs && (
              <>
                <div className="label label-sage" style={{ marginBottom: 16 }}>Full Specification</div>
                <table className="pdp-spec-table">
                  <tbody>
                    {!!specs.width_mm   && <SpecRow label="Width"   value={`${specs.width_mm}mm`} />}
                    {!!specs.depth_mm   && <SpecRow label="Depth"   value={`${specs.depth_mm}mm`} />}
                    {!!specs.height_mm  && <SpecRow label="Height"  value={`${specs.height_mm}mm`} />}
                    {!!specs.seat_height_mm && <SpecRow label="Seat height" value={`${specs.seat_height_mm}mm`} />}
                    {!!specs.diameter_mm    && <SpecRow label="Diameter"    value={`${specs.diameter_mm}mm`} />}
                    {!!specs.weight_kg      && <SpecRow label="Weight"      value={`${specs.weight_kg}kg`} />}
                    {sv(specs.material)  && <SpecRow label="Material"  value={sv(specs.material)!} />}
                    {sv(specs.finish)    && <SpecRow label="Finish"    value={sv(specs.finish)!} />}
                    {sv(specs.fabric)    && <SpecRow label="Fabric"    value={sv(specs.fabric)!} />}
                    {specs.com_available && <SpecRow label="COM"       value="Available" />}
                    {sv(specs.care_instructions) && <SpecRow label="Care" value={sv(specs.care_instructions)!} />}
                    {isLighting && sv(specs.bulb_type) && <SpecRow label="Bulb type" value={sv(specs.bulb_type)!} />}
                    {isLighting && sv(specs.wattage)   && <SpecRow label="Wattage"   value={sv(specs.wattage)!} />}
                    {isLighting && sv(specs.voltage)   && <SpecRow label="Voltage"   value={sv(specs.voltage)!} />}
                    {sv(specs.ip_rating) && <SpecRow label="IP rating" value={sv(specs.ip_rating)!} />}
                    {isLighting && typeof specs.dimmable === 'boolean' && <SpecRow label="Dimmable" value={specs.dimmable ? 'Yes' : 'No'} />}
                    {configuration.specRows
                      .filter(r => sv(r.value))
                      .map(r => (
                        <SpecRow key={r.id} label={r.label} value={`${sv(r.value)}${r.unit ? ` ${r.unit}` : ''}`} />
                      ))}
                  </tbody>
                </table>
                {specs.technical_notes && (
                  <div style={{ marginTop: 16, padding: 16, background: 'var(--sage-light)', fontSize: 12, color: 'var(--stone)' }}>
                    <strong style={{ color: 'var(--forest)', display: 'block', marginBottom: 6 }}>Technical Passport™</strong>
                    {specs.technical_notes}
                  </div>
                )}
              </>
            )}

            {/* Technical Passport™ claims — verified, public, unexpired only */}
            {configuration.passport.length > 0 && (
              <div style={{
                background: 'var(--sage-light, #E8EDE6)', padding: '14px 16px',
                marginTop: specs ? 12 : 0, display: 'grid', gap: 8,
              }}>
                {configuration.passport.map(pa => (
                  <div key={pa.label} style={{ fontSize: 12.5, color: 'var(--forest)' }}>
                    <span aria-hidden>✓ </span>{pa.label}{pa.value ? ` — ${pa.value}` : ''}
                  </div>
                ))}
              </div>
            )}

            {/* Downloads — only documents that actually exist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
              {(documents ?? [])
                .filter((d: Record<string, unknown>) => typeof d.url === 'string' && (d.url as string).startsWith('http'))
                .map((d: Record<string, unknown>) => (
                  <a
                    key={d.id as string}
                    href={d.url as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-full"
                    style={{ justifyContent: 'flex-start', paddingLeft: 0 }}
                  >
                    ↓ {DOC_LABELS[d.document_type as string] ?? (d.label ? `Download ${d.label}` : 'Download Document')}
                  </a>
                ))}
              <a
                href={`/api/products/${product.slug}/tear-sheet`}
                className="btn btn-ghost btn-full"
                style={{ justifyContent: 'flex-start', paddingLeft: 0 }}
                download={`FBA-${product.reference_code ?? product.slug}.pdf`}
              >
                ↓ Download Tear Sheet
              </a>
            </div>

            {/* Delivery & notes — after passport + downloads */}
            <div style={{ marginTop: 20 }}>
              <div className="label label-sage" style={{ marginBottom: 12 }}>Delivery &amp; notes</div>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--stone)' }}>
                {product.shipping_notes || DEFAULT_SHIPPING_NOTE}
              </p>
            </div>
          </div>

          {/* Column 1, beneath the media — technical description
              (fills the previously dead space under the image). */}
          <div className="pdp-desc">
            <div className="label label-sage" style={{ marginBottom: 16 }}>Technical description</div>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--stone)', whiteSpace: 'pre-wrap' }}>
              {product.technical_description || product.description}
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--forest)', marginTop: 20, fontStyle: 'italic' }}>
              {product.customisation_note || 'This item can be customised — contact a member of the team with your requirements to find out what is possible.'}
            </p>
          </div>
        </div>

        {/* ── Discovery content (renders only when it has content) ── */}
        {relatedRows.length > 0 && (
          <>
            <div className="divider-lg" />
            <DiscoveryGrid label="More from this category" rows={relatedRows} />
          </>
        )}
        {artisanRows.length > 0 && (
          <>
            <div className="divider-lg" />
            <DiscoveryGrid label={`More from ${product.artisan?.name ?? 'this maker'}`} rows={artisanRows} />
          </>
        )}
        <RecentlyViewed current={{
          slug: product.slug,
          name: product.name,
          image: customMatchSummary.imageUrl,
          category: (product.category as { name?: string } | null)?.name ?? null,
        }} />
      </div>

      {/* Sticky action bar — appears once the configuration area has
          scrolled out of view; respects viewer pricing permissions. */}
      <StickyActionBar
        productName={product.name}
        priceLine={priceLine}
        dispatchLine={dispatchLine}
        actionLabel={stickyLabel}
        targetId="pdp-actions"
      />

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

function DiscoveryGrid({ label, rows }: { label: string; rows: Record<string, unknown>[] }) {
  return (
    <div>
      <div className="label label-sage" style={{ marginBottom: 24 }}>{label}</div>
      <div className="grid-4">
        {rows.map(rp => (
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
      <td className="pdp-spec-label">{label}</td>
      <td>{value}</td>
    </tr>
  )
}
