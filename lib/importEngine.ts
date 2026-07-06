import 'server-only'
import { createHash } from 'crypto'
import { supabaseAdmin } from './supabase'

// ============================================================
// Import engine (admin brief §4)
// Modes: create_only | upsert | force_refresh | replace_batch | purge_reload
// - Preview classifies without writing.
// - Run writes products + specs + documents, records an
//   import_batches row and per-row import_batch_items with
//   before-snapshots (rollback-lite).
// - Never silently skips: every row gets an action + message.
// ============================================================

export type ImportMode = 'create_only' | 'upsert' | 'force_refresh' | 'replace_batch' | 'purge_reload'
export type ItemAction = 'create' | 'update' | 'unchanged' | 'skip' | 'conflict' | 'archive' | 'fail'

type Row = Record<string, string>

export interface ClassifiedItem {
  rowNumber: number
  action: ItemAction
  message: string
  warning?: string
  error?: string
  slug: string
  name: string
  sku?: string | null
  referenceCode?: string | null
  sourceRowId?: string | null
  matchedProductId?: string | null
  matchedBy?: string
  product?: Record<string, unknown>
  specs?: Record<string, unknown>
  documents?: Array<{ document_type: string; url: string; label: string }>
}

export interface ImportSummary {
  productsFound: number
  create: number
  update: number
  unchanged: number
  skip: number
  conflict: number
  archive: number
  fail: number
}

// ── Row value helpers (kept compatible with FBA Standard sheets) ──

function col(row: Row, ...aliases: string[]): string {
  for (const a of aliases) {
    const v = (row[a] ?? '').toString().trim()
    if (v) return v
  }
  return ''
}

function num(row: Row, ...aliases: string[]): number | null {
  const v = col(row, ...aliases)
  if (!v) return null
  const n = parseFloat(v.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : n
}

function bool(val: string): boolean {
  return ['yes', 'true', '1'].includes(val.toLowerCase())
}

function mapAudience(raw: string): 'retail' | 'trade' | 'retail_and_trade' {
  const v = raw.toLowerCase()
  if (v.includes('trade only') || v === 'trade') return 'trade'
  if (v.includes('retail only') || v === 'retail') return 'retail'
  return 'retail_and_trade'
}

function mapPriceType(raw: string): 'fixed' | 'price_on_request' {
  const v = raw.toLowerCase()
  if (v === 'poa' || v.includes('request') || v.includes('enquire')) return 'price_on_request'
  return 'fixed'
}

function mapVisibility(raw: string): 'draft' | 'published' | 'hidden' {
  const v = raw.toLowerCase()
  if (v === 'published') return 'published'
  if (v === 'hidden') return 'hidden'
  return 'draft'
}

/**
 * Google Drive share links are HTML pages, not images. Convert them
 * to the direct-view CDN URL so next/image can render them.
 *   https://drive.google.com/file/d/FILE_ID/view?...  →  https://lh3.googleusercontent.com/d/FILE_ID
 *   https://drive.google.com/open?id=FILE_ID          →  https://lh3.googleusercontent.com/d/FILE_ID
 */
function normaliseImageUrl(url: string): string {
  const m = url.match(/drive\.google\.com\/(?:file\/d\/([a-zA-Z0-9_-]+)|(?:open|uc)\?[^#]*id=([a-zA-Z0-9_-]+))/)
  if (m) {
    const fileId = m[1] ?? m[2]
    if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}`
  }
  return url
}

function normaliseSlug(raw: string): string {
  return raw.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

// ── Relationship resolvers (cached per run) ──────────────────

class Resolvers {
  private categories = new Map<string, string>()
  private subcategories = new Map<string, string>()
  private artisans = new Map<string, string>()

  async preload() {
    const [{ data: cats }, { data: subs }, { data: arts }] = await Promise.all([
      supabaseAdmin.from('categories').select('id, name'),
      supabaseAdmin.from('subcategories').select('id, name, category_id'),
      supabaseAdmin.from('artisans').select('id, name'),
    ])
    for (const c of cats ?? []) this.categories.set(c.name.toLowerCase(), c.id)
    for (const s of subs ?? []) this.subcategories.set(`${s.category_id}:${s.name.toLowerCase()}`, s.id)
    for (const a of arts ?? []) this.artisans.set(a.name.toLowerCase(), a.id)
  }

  category(name: string): string | null {
    if (!name) return null
    const key = name.toLowerCase()
    if (this.categories.has(key)) return this.categories.get(key)!
    // partial match fallback
    for (const [k, id] of this.categories) if (k.includes(key) || key.includes(k)) return id
    return null
  }

  subcategory(name: string, categoryId: string | null): string | null {
    if (!name) return null
    const key = `${categoryId}:${name.toLowerCase()}`
    if (this.subcategories.has(key)) return this.subcategories.get(key)!
    for (const [k, id] of this.subcategories) {
      const [, n] = k.split(':')
      if (n === name.toLowerCase()) return id
    }
    return null
  }

  artisanId(name: string): string | null {
    if (!name) return null
    return this.artisans.get(name.toLowerCase()) ?? null
  }

  /** Create the artisan if missing (write phase only). */
  async ensureArtisan(name: string): Promise<string | null> {
    if (!name) return null
    const existing = this.artisanId(name)
    if (existing) return existing
    const slug = normaliseSlug(name)
    const { data: created } = await supabaseAdmin
      .from('artisans')
      .insert({ name, slug, is_active: true })
      .select('id')
      .single()
    if (created) this.artisans.set(name.toLowerCase(), created.id)
    return created?.id ?? null
  }
}

// ── Row → product/specs/documents mapping ────────────────────

const DOCUMENT_COLUMNS: Array<{ type: string; label: string; aliases: string[] }> = [
  { type: 'product_specification', label: 'Product Specification', aliases: ['Product Specification URL', 'Spec Sheet URL', 'Specification URL'] },
  { type: 'upholstery_program',    label: 'Upholstery Program',    aliases: ['Upholstery Program URL', 'Upholstery Programme URL'] },
  { type: 'material_finishes',     label: 'Material & Finishes',   aliases: ['Material & Finishes URL', 'Material and Finishes URL', 'Finishes Document URL'] },
  { type: 'tear_sheet',            label: 'Tear Sheet',            aliases: ['Tear Sheet URL'] },
  { type: 'care_maintenance',      label: 'Care & Maintenance',    aliases: ['Care & Maintenance URL', 'Care Maintenance URL', 'Care Sheet URL'] },
  { type: 'installation_guide',    label: 'Installation Guide',    aliases: ['Installation Guide URL'] },
]

export function mapRow(row: Row, resolvers: Resolvers) {
  const artisanName  = col(row, 'Artisan / Studio', 'Artisan', 'Studio', 'Brand')
  const categoryName = col(row, 'Category')
  const subcatName   = col(row, 'Subcategory', 'Sub-category', 'Subcategories')

  const categoryId    = resolvers.category(categoryName)
  const subcategoryId = resolvers.subcategory(subcatName, categoryId)

  const rawImages = col(row, 'Images (URLs)', 'Images', 'Image URL', 'Image')
  const images = rawImages
    ? rawImages.split(/[\n,]+/).map(u => normaliseImageUrl(u.trim())).filter(u => u.startsWith('http'))
    : []

  const product: Record<string, unknown> = {
    name:              col(row, 'Product Name', 'Name', 'Products Product Name'),
    slug:              normaliseSlug(col(row, 'Slug (URL)', 'Slug', 'URL Slug')),
    sku:               col(row, 'SKU') || null,
    reference_code:    col(row, 'Reference Code', 'Ref Code', 'Ref') || null,
    category_id:       categoryId,
    subcategory_id:    subcategoryId,
    description:       col(row, 'Full Description', 'Description', 'Long Description') || col(row, 'Short Description'),
    short_description: col(row, 'Short Description', 'Tagline') || null,
    technical_description: col(row, 'Technical Description') || null,
    customisation_note:    col(row, 'Customisation Note', 'Customization Note') || null,
    retail_price:      num(row, 'Retail Price', 'RRP') ?? null,
    trade_price:       num(row, 'Trade Price', 'Net Price') ?? null,
    supplier_cost:     num(row, 'Supplier Cost', 'Cost Price') ?? null,
    price_type:        mapPriceType(col(row, 'Price Type', 'PriceType', 'Pricing Type')),
    currency:          (col(row, 'Currency') === 'EUR' ? 'EUR' : col(row, 'Currency') === 'USD' ? 'USD' : 'GBP'),
    visibility:        mapVisibility(col(row, 'Visibility', 'Status', 'Published')),
    audience:          mapAudience(col(row, 'Audience', 'Audience Type')),
    is_fba_collection: bool(col(row, 'FBA Collection Piece', 'FBA Collection', 'Is FBA Collection')),
    is_fba_home:       bool(col(row, 'FBA Home', 'Is FBA Home')),
    made_to_order:     bool(col(row, 'Made to Order', 'Made To Order')),
    dispatch_time_label: col(row, 'Dispatch Time', 'Dispatch Time Label') || null,
    lead_time:         col(row, 'Lead Time') || null,
    lead_time_min_weeks: num(row, 'Lead Time Min Weeks', 'Lead Time Min (weeks)'),
    lead_time_max_weeks: num(row, 'Lead Time Max Weeks', 'Lead Time Max (weeks)'),
    shipping_origin:   col(row, 'Shipping Origin', 'Origin') || null,
    shipping_notes:    col(row, 'Shipping Notes', 'Shipping') || null,
    images,
    seo_title:         col(row, 'SEO Title') || null,
    seo_description:   col(row, 'SEO Description') || null,
  }

  const specs: Record<string, unknown> = {
    width_mm:          num(row, 'Width (mm)', 'Width'),
    depth_mm:          num(row, 'Depth (mm)', 'Depth'),
    height_mm:         num(row, 'Height (mm)', 'Height'),
    seat_height_mm:    num(row, 'Seat Height (mm)', 'Seat Height'),
    diameter_mm:       num(row, 'Diameter (mm)', 'Diameter'),
    weight_kg:         num(row, 'Weight (kg)', 'Weight'),
    material:          col(row, 'Material') || null,
    finish:            col(row, 'Finish') || null,
    fabric:            col(row, 'Fabric / Upholstery', 'Fabric', 'Upholstery') || null,
    com_available:     bool(col(row, 'COM Available')),
    care_instructions: col(row, 'Care Instructions') || null,
    technical_notes:   col(row, 'Technical Notes', 'Notes') || null,
    frame_material:                col(row, 'Frame Material') || null,
    frame_material_options:        col(row, 'Frame Material Options', 'Frame Finish / Colour Options') || null,
    armrest_material:              col(row, 'Armrest Material') || null,
    seat_material:                 col(row, 'Seat Material') || null,
    back_material:                 col(row, 'Back Material') || null,
    seat_back_upholstery_options:  col(row, 'Seat & Back Upholstery Options') || null,
    glides:                        col(row, 'Glides') || null,
    stackable:                     col(row, 'Stackable') ? bool(col(row, 'Stackable')) : null,
    indoor_outdoor_use:            col(row, 'Indoor / Outdoor Use', 'Indoor/Outdoor') || null,
    other_available_options:       col(row, 'Other Available Options', 'Other Options') || null,
  }

  const documents = DOCUMENT_COLUMNS
    .map(d => ({ document_type: d.type, label: d.label, url: col(row, ...d.aliases) }))
    .filter(d => d.url.startsWith('http'))

  const meta = {
    artisanName,
    sourceRowId: col(row, 'Source Product ID', 'Source ID', 'External ID') || null,
  }

  return { product, specs, documents, meta }
}

// ── Stable content hash ──────────────────────────────────────

export function computeSourceHash(product: Record<string, unknown>, specs: Record<string, unknown>, documents: unknown[]): string {
  const stable = stableStringify({ product, specs, documents })
  return createHash('sha256').update(stable).digest('hex')
}

/** Deterministic JSON: object keys sorted recursively at every level. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

// ── Existing product index for matching ──────────────────────

interface ExistingProduct {
  id: string
  slug: string
  sku: string | null
  reference_code: string | null
  source_row_id: string | null
  source_hash: string | null
  source_file_id: string | null
  name: string
  artisan_id: string | null
  archived_at: string | null
}

export async function loadExistingIndex() {
  const bySlug = new Map<string, ExistingProduct>()
  const bySku = new Map<string, ExistingProduct>()
  const byRef = new Map<string, ExistingProduct>()
  const bySourceRowId = new Map<string, ExistingProduct>()
  const all: ExistingProduct[] = []

  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('id, slug, sku, reference_code, source_row_id, source_hash, source_file_id, name, artisan_id, archived_at')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Failed to load existing products: ${error.message}`)
    for (const p of (data ?? []) as ExistingProduct[]) {
      all.push(p)
      bySlug.set(p.slug, p)
      if (p.sku) bySku.set(p.sku.toLowerCase(), p)
      if (p.reference_code) byRef.set(p.reference_code.toLowerCase(), p)
      if (p.source_row_id) bySourceRowId.set(p.source_row_id, p)
    }
    if (!data || data.length < PAGE) break
  }

  return { bySlug, bySku, byRef, bySourceRowId, all }
}

// ── Classification (shared by preview and run) ───────────────

export async function classifyRows(rows: Row[], mode: ImportMode): Promise<{ items: ClassifiedItem[]; summary: ImportSummary; resolvers: Resolvers; index: Awaited<ReturnType<typeof loadExistingIndex>> }> {
  const resolvers = new Resolvers()
  await resolvers.preload()
  const index = await loadExistingIndex()

  const items: ClassifiedItem[] = []
  const seenSlugs = new Set<string>()

  rows.forEach((row, i) => {
    const rowNumber = i + 1
    const { product, specs, documents, meta } = mapRow(row, resolvers)
    const slug = product.slug as string
    const name = product.name as string

    if (!name || !slug) {
      items.push({ rowNumber, action: 'skip', message: 'Row is missing a product name or slug — cannot import.', slug, name, product, specs })
      return
    }
    if (seenSlugs.has(slug)) {
      items.push({ rowNumber, action: 'skip', message: `Duplicate slug "${slug}" appears earlier in this file — only the first occurrence is processed.`, slug, name })
      return
    }
    seenSlugs.add(slug)

    // Matching priority: source_row_id → reference_code → sku → slug → name+artisan
    const candidates = new Map<string, { p: ExistingProduct; by: string }>()
    const srid = meta.sourceRowId
    if (srid && index.bySourceRowId.has(srid)) candidates.set(index.bySourceRowId.get(srid)!.id, { p: index.bySourceRowId.get(srid)!, by: 'source ID' })
    const ref = (product.reference_code as string | null)?.toLowerCase()
    if (ref && index.byRef.has(ref)) candidates.set(index.byRef.get(ref)!.id, { p: index.byRef.get(ref)!, by: 'reference code' })
    const sku = (product.sku as string | null)?.toLowerCase()
    if (sku && index.bySku.has(sku)) candidates.set(index.bySku.get(sku)!.id, { p: index.bySku.get(sku)!, by: 'SKU' })
    if (index.bySlug.has(slug)) candidates.set(index.bySlug.get(slug)!.id, { p: index.bySlug.get(slug)!, by: 'slug' })

    if (candidates.size > 1) {
      const list = [...candidates.values()].map(c => `${c.p.name} (${c.by})`).join(' vs ')
      items.push({ rowNumber, action: 'conflict', message: `Row matches more than one existing product: ${list}. Resolve manually before importing this row.`, slug, name, sku: product.sku as string | null, referenceCode: product.reference_code as string | null })
      return
    }

    const match = candidates.size === 1 ? [...candidates.values()][0] : null
    const hash = computeSourceHash(product, specs, documents)

    if (!match) {
      items.push({
        rowNumber, action: 'create',
        message: 'New product — will be created.',
        slug, name,
        sku: product.sku as string | null,
        referenceCode: product.reference_code as string | null,
        sourceRowId: srid,
        product: { ...product, source_hash: hash }, specs, documents,
      })
      return
    }

    if (mode === 'create_only') {
      items.push({
        rowNumber, action: 'skip',
        message: `Product matched existing record "${match.p.name}" by ${match.by}. Import mode is Create New Only, so it was not updated. Choose Update Existing or Force Refresh to update this product.`,
        slug, name, matchedProductId: match.p.id, matchedBy: match.by,
      })
      return
    }

    const unchanged = match.p.source_hash === hash
    if (unchanged && mode !== 'force_refresh') {
      items.push({
        rowNumber, action: 'unchanged',
        message: `Matched "${match.p.name}" by ${match.by} — source data is identical to the last import, nothing to update. Use Force Refresh to rewrite it anyway.`,
        slug, name, matchedProductId: match.p.id, matchedBy: match.by,
      })
      return
    }

    items.push({
      rowNumber, action: 'update',
      message: unchanged
        ? `Matched "${match.p.name}" by ${match.by} — force refresh will rewrite all fields from source.`
        : `Matched "${match.p.name}" by ${match.by} — source data changed, product will be updated.`,
      warning: match.p.archived_at ? 'This product is currently archived; updating it will NOT unarchive it.' : undefined,
      slug, name,
      sku: product.sku as string | null,
      referenceCode: product.reference_code as string | null,
      sourceRowId: srid,
      matchedProductId: match.p.id, matchedBy: match.by,
      product: { ...product, source_hash: hash }, specs, documents,
    })
  })

  const summary: ImportSummary = {
    productsFound: rows.length,
    create: items.filter(x => x.action === 'create').length,
    update: items.filter(x => x.action === 'update').length,
    unchanged: items.filter(x => x.action === 'unchanged').length,
    skip: items.filter(x => x.action === 'skip').length,
    conflict: items.filter(x => x.action === 'conflict').length,
    archive: 0,
    fail: items.filter(x => x.action === 'fail').length,
  }

  // replace_batch: products from the same source file no longer present → archive
  return { items, summary, resolvers, index }
}

// ── Batch ref generator ──────────────────────────────────────

export async function nextBatchRef(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const { count } = await supabaseAdmin
    .from('import_batches')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', `${today}T00:00:00Z`)
  return `IMP-${today}-${String((count ?? 0) + 1).padStart(3, '0')}`
}
