import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import ProductsTable, { type ProductRow } from './ProductsTable'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Products' }

const PER_PAGE = 50

const TABS = [
  { key: 'all',         label: 'All' },
  { key: 'published',   label: 'Published' },
  { key: 'draft',       label: 'Draft' },
  { key: 'unpublished', label: 'Unpublished' },
  { key: 'archived',    label: 'Archived' },
] as const

type TabKey = (typeof TABS)[number]['key']

interface Params {
  status?: string
  q?: string
  category?: string
  artisan?: string
  price?: string
  images?: string
  sort?: string
  page?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function AdminProductsPage({ searchParams }: { searchParams: Params }) {
  const session = await getSession()
  const isAdmin = session?.role === 'admin'

  const tab: TabKey = (TABS.some(t => t.key === searchParams.status) ? searchParams.status : 'all') as TabKey
  // Sanitise: PostgREST or-filters break on commas/parens
  const q = (searchParams.q ?? '').replace(/[,()%]/g, ' ').trim().slice(0, 80)
  const category = UUID_RE.test(searchParams.category ?? '') ? searchParams.category! : ''
  const artisan  = UUID_RE.test(searchParams.artisan ?? '') ? searchParams.artisan! : ''
  const price    = ['por', 'has_trade', 'has_retail', 'missing'].includes(searchParams.price ?? '') ? searchParams.price! : ''
  const images   = ['none', 'few'].includes(searchParams.images ?? '') ? searchParams.images! : ''
  const sort     = ['newest', 'oldest', 'name', 'updated'].includes(searchParams.sort ?? '') ? searchParams.sort! : 'newest'
  const page     = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1)

  let query = supabaseAdmin
    .from('products')
    .select('id, name, slug, visibility, audience, retail_price, trade_price, price_type, archived_at, lead_time, images, created_at, category:categories(name), artisan:artisans(name)', { count: 'exact' })

  switch (tab) {
    case 'published':   query = query.eq('visibility', 'published').is('archived_at', null); break
    case 'draft':       query = query.eq('visibility', 'draft').is('archived_at', null); break
    case 'unpublished': query = query.eq('visibility', 'hidden').is('archived_at', null); break
    case 'archived':    query = query.not('archived_at', 'is', null); break
  }

  if (q)        query = query.or(`name.ilike.*${q}*,slug.ilike.*${q}*,sku.ilike.*${q}*,reference_code.ilike.*${q}*`)
  if (category) query = query.eq('category_id', category)
  if (artisan)  query = query.eq('artisan_id', artisan)

  switch (price) {
    case 'por':        query = query.eq('price_type', 'price_on_request'); break
    case 'has_trade':  query = query.not('trade_price', 'is', null); break
    case 'has_retail': query = query.not('retail_price', 'is', null); break
    case 'missing':    query = query.eq('price_type', 'fixed').is('retail_price', null).is('trade_price', null); break
  }

  switch (sort) {
    case 'oldest':  query = query.order('created_at', { ascending: true }); break
    case 'name':    query = query.order('name', { ascending: true }); break
    case 'updated': query = query.order('updated_at', { ascending: false }); break
    default:        query = query.order('created_at', { ascending: false })
  }

  query = query.range((page - 1) * PER_PAGE, page * PER_PAGE - 1)

  const [{ data: raw, count }, { data: categories }, { data: artisans }] = await Promise.all([
    query,
    supabaseAdmin.from('categories').select('id, name').order('name'),
    supabaseAdmin.from('artisans').select('id, name').order('name'),
  ])

  let products: ProductRow[] = (raw ?? []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    name: p.name as string,
    slug: p.slug as string,
    visibility: p.visibility as string,
    audience: p.audience as string,
    retail_price: p.retail_price as number | null,
    trade_price: p.trade_price as number | null,
    price_type: p.price_type as string,
    archived_at: p.archived_at as string | null,
    lead_time: p.lead_time as string | null,
    image_count: Array.isArray(p.images) ? (p.images as string[]).length : 0,
    category_name: (p.category as { name?: string } | null)?.name ?? null,
    artisan_name: (p.artisan as { name?: string } | null)?.name ?? null,
    created_at: p.created_at as string,
  }))

  // Image-completeness filters are applied post-query (array length is not
  // directly filterable via PostgREST) — applies to the current page of results.
  if (images === 'none') products = products.filter(p => p.image_count === 0)
  if (images === 'few')  products = products.filter(p => p.image_count <= 1)

  const total = count ?? products.length
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  // Preserve current filters in tab/pagination links
  const baseParams = new URLSearchParams()
  if (q) baseParams.set('q', q)
  if (category) baseParams.set('category', category)
  if (artisan) baseParams.set('artisan', artisan)
  if (price) baseParams.set('price', price)
  if (images) baseParams.set('images', images)
  if (sort !== 'newest') baseParams.set('sort', sort)

  function href(overrides: Record<string, string | null>): string {
    const p = new URLSearchParams(baseParams)
    if (tab !== 'all') p.set('status', tab)
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    const s = p.toString()
    return s ? `/admin/products?${s}` : '/admin/products'
  }

  const selectStyle: React.CSSProperties = {
    padding: '7px 10px', border: '1px solid var(--light-line)', borderRadius: 6,
    fontSize: 12, background: 'var(--warm-white)', color: 'var(--forest)',
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Products</h1>
          <p className="admin-subtitle">
            {total} product{total === 1 ? '' : 's'}
            {tab !== 'all' ? ` · ${TABS.find(t => t.key === tab)?.label}` : ''}
            {q ? ` · search "${q}"` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/imports" className="btn btn-ghost btn-sm">Import history</Link>
          <Link href="/admin/products/import" className="btn btn-ghost btn-sm">↑ Import from Drive</Link>
          <Link href="/admin/products/new" className="btn btn-primary btn-sm">+ Add Product</Link>
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--light-line)' }}>
        {TABS.map(t => (
          <Link
            key={t.key}
            href={href({ status: t.key === 'all' ? null : t.key, page: null })}
            className="btn btn-ghost btn-sm"
            style={{
              borderBottom: tab === t.key ? '2px solid var(--caramel, #a05a2c)' : '2px solid transparent',
              borderRadius: 0,
              fontWeight: tab === t.key ? 600 : 400,
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Search + filter bar (plain GET form — no JS needed) */}
      <form method="get" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {tab !== 'all' && <input type="hidden" name="status" value={tab} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search name, slug, SKU, reference…"
          aria-label="Search products"
          style={{ ...selectStyle, minWidth: 240, flex: '1 1 240px' }}
        />
        <select name="category" defaultValue={category} aria-label="Filter by category" style={selectStyle}>
          <option value="">All categories</option>
          {(categories ?? []).map((c: { id: string; name: string }) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="artisan" defaultValue={artisan} aria-label="Filter by artisan" style={selectStyle}>
          <option value="">All artisans</option>
          {(artisans ?? []).map((a: { id: string; name: string }) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select name="price" defaultValue={price} aria-label="Filter by price status" style={selectStyle}>
          <option value="">Any price status</option>
          <option value="por">Price on request</option>
          <option value="has_retail">Has retail price</option>
          <option value="has_trade">Has trade price</option>
          <option value="missing">Missing price</option>
        </select>
        <select name="images" defaultValue={images} aria-label="Filter by image completeness" style={selectStyle}>
          <option value="">Any images</option>
          <option value="none">No images</option>
          <option value="few">1 image or fewer</option>
        </select>
        <select name="sort" defaultValue={sort} aria-label="Sort" style={selectStyle}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
          <option value="updated">Recently updated</option>
        </select>
        <button type="submit" className="btn btn-primary btn-sm">Apply</button>
        {(q || category || artisan || price || images || sort !== 'newest') && (
          <Link href={tab === 'all' ? '/admin/products' : `/admin/products?status=${tab}`} className="btn btn-ghost btn-sm">
            Clear
          </Link>
        )}
      </form>

      {!products.length ? (
        <div className="empty-state">
          <h3>No products match this filter.</h3>
          <p>Clear filters or adjust search.</p>
        </div>
      ) : (
        <ProductsTable products={products} isAdmin={isAdmin} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 16, fontSize: 13 }}>
          {page > 1 ? (
            <Link href={href({ page: String(page - 1) })} className="btn btn-ghost btn-sm">← Previous</Link>
          ) : <span style={{ opacity: 0.4 }}>← Previous</span>}
          <span style={{ color: 'var(--stone)' }}>Page {page} of {totalPages}</span>
          {page < totalPages ? (
            <Link href={href({ page: String(page + 1) })} className="btn btn-ghost btn-sm">Next →</Link>
          ) : <span style={{ opacity: 0.4 }}>Next →</span>}
        </div>
      )}
    </>
  )
}
