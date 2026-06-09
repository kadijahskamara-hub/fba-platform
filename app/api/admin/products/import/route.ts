import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// ─── Column name normaliser ───────────────────────────────────────────────────
// FBA Standard Excel files may have slightly varied column names.
// Try each alias in order and return the first non-empty value found.

function col(row: Record<string, string>, ...aliases: string[]): string {
  for (const a of aliases) {
    const v = (row[a] ?? '').trim()
    if (v) return v
  }
  return ''
}

function num(row: Record<string, string>, ...aliases: string[]): number | null {
  const v = col(row, ...aliases)
  if (!v) return null
  const n = parseFloat(v.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : n
}

function bool(val: string): boolean {
  return ['yes', 'true', '1'].includes(val.toLowerCase())
}

// ─── Audience mapping ─────────────────────────────────────────────────────────
function mapAudience(raw: string): 'retail' | 'trade' | 'retail_and_trade' {
  const v = raw.toLowerCase()
  if (v.includes('trade only') || v === 'trade') return 'trade'
  if (v.includes('retail only') || v === 'retail') return 'retail'
  return 'retail_and_trade'
}

// ─── Price type mapping ───────────────────────────────────────────────────────
function mapPriceType(raw: string): 'fixed' | 'price_on_request' {
  const v = raw.toLowerCase()
  if (v === 'poa' || v.includes('request') || v.includes('enquire')) return 'price_on_request'
  return 'fixed'
}

// ─── Visibility mapping ───────────────────────────────────────────────────────
function mapVisibility(raw: string): 'draft' | 'published' | 'hidden' {
  const v = raw.toLowerCase()
  if (v === 'published') return 'published'
  if (v === 'hidden')    return 'hidden'
  return 'draft'
}

// ─── Category / subcategory resolver ─────────────────────────────────────────
const categoryCache: Record<string, string> = {}
const subcategoryCache: Record<string, string> = {}

async function resolveCategory(name: string): Promise<string | null> {
  if (!name) return null
  const key = name.toLowerCase()
  if (categoryCache[key]) return categoryCache[key]
  const { data } = await supabaseAdmin
    .from('categories')
    .select('id, name')
    .ilike('name', `%${name}%`)
    .limit(1)
  if (data?.[0]) categoryCache[key] = data[0].id
  return data?.[0]?.id ?? null
}

async function resolveSubcategory(name: string, categoryId: string | null): Promise<string | null> {
  if (!name) return null
  const key = `${categoryId}:${name.toLowerCase()}`
  if (subcategoryCache[key]) return subcategoryCache[key]
  let q = supabaseAdmin.from('subcategories').select('id').ilike('name', `%${name}%`).limit(1)
  if (categoryId) q = q.eq('category_id', categoryId) as typeof q
  const { data } = await q
  if (data?.[0]) subcategoryCache[key] = data[0].id
  return data?.[0]?.id ?? null
}

// ─── Artisan resolver / creator ───────────────────────────────────────────────
const artisanCache: Record<string, string> = {}

async function resolveArtisan(name: string): Promise<string | null> {
  if (!name) return null
  const key = name.toLowerCase()
  if (artisanCache[key]) return artisanCache[key]

  // Try exact match first
  const { data: existing } = await supabaseAdmin
    .from('artisans')
    .select('id')
    .ilike('name', name)
    .limit(1)

  if (existing?.[0]) {
    artisanCache[key] = existing[0].id
    return existing[0].id
  }

  // Create minimal artisan record
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const { data: created } = await supabaseAdmin
    .from('artisans')
    .insert({ name, slug, is_active: true })
    .select('id')
    .single()

  if (created) artisanCache[key] = created.id
  return created?.id ?? null
}

// ─── Main row mapper ──────────────────────────────────────────────────────────
async function mapRowToProduct(row: Record<string, string>) {
  // Resolve relationships
  const artisanName   = col(row, 'Artisan / Studio', 'Artisan', 'Studio', 'Brand')
  const categoryName  = col(row, 'Category')
  const subcatName    = col(row, 'Subcategory', 'Sub-category', 'Subcategories')

  const artisanId    = await resolveArtisan(artisanName)
  const categoryId   = await resolveCategory(categoryName)
  const subcategoryId = await resolveSubcategory(subcatName, categoryId)

  // Images — comma or newline separated URLs
  const rawImages = col(row, 'Images (URLs)', 'Images', 'Image URL', 'Image')
  const images = rawImages
    ? rawImages.split(/[\n,]+/).map(u => u.trim()).filter(u => u.startsWith('http'))
    : []

  const priceTypeRaw = col(row, 'Price Type', 'PriceType', 'Pricing Type')
  const visibilityRaw = col(row, 'Visibility', 'Status', 'Published')

  const product = {
    name:              col(row, 'Product Name', 'Name', 'Products Product Name'),
    slug:              col(row, 'Slug (URL)', 'Slug', 'URL Slug'),
    sku:               col(row, 'SKU') || null,
    reference_code:    col(row, 'Reference Code', 'Ref Code', 'Ref') || null,
    artisan_id:        artisanId,
    category_id:       categoryId,
    subcategory_id:    subcategoryId,
    description:       col(row, 'Full Description', 'Description', 'Long Description') || col(row, 'Short Description'),
    short_description: col(row, 'Short Description', 'Tagline') || null,
    retail_price:      num(row, 'Retail Price', 'RRP') ?? null,
    trade_price:       num(row, 'Trade Price', 'Net Price') ?? null,
    supplier_cost:     num(row, 'Supplier Cost', 'Cost Price') ?? null,
    price_type:        mapPriceType(priceTypeRaw),
    currency:          (col(row, 'Currency') === 'EUR' ? 'EUR' : col(row, 'Currency') === 'USD' ? 'USD' : 'GBP') as 'GBP' | 'EUR' | 'USD',
    visibility:        mapVisibility(visibilityRaw),
    audience:          mapAudience(col(row, 'Audience', 'Audience Type')),
    is_fba_collection: bool(col(row, 'FBA Collection Piece', 'FBA Collection', 'Is FBA Collection')),
    is_fba_home:       bool(col(row, 'FBA Home', 'Is FBA Home')),
    lead_time:         col(row, 'Lead Time') || null,
    shipping_origin:   col(row, 'Shipping Origin', 'Origin') || null,
    shipping_notes:    col(row, 'Shipping Notes', 'Shipping') || null,
    images,
    seo_title:         col(row, 'SEO Title') || null,
    seo_description:   col(row, 'SEO Description') || null,
  }

  const specs = {
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
    // Generic material config
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

  return { product, specs }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  let rows: Record<string, string>[]
  try {
    const body = await req.json()
    rows = body.rows
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No rows provided' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const results = { inserted: 0, skipped: 0, errors: [] as string[] }

  for (const row of rows) {
    try {
      const { product, specs } = await mapRowToProduct(row)

      // Skip rows without a name or slug
      if (!product.name || !product.slug) {
        results.skipped++
        continue
      }

      // Upsert by slug — skip if already exists
      const { data: existing } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('slug', product.slug)
        .single()

      if (existing) {
        results.skipped++
        continue
      }

      // Insert product
      const { data: inserted, error: productError } = await supabaseAdmin
        .from('products')
        .insert(product)
        .select('id')
        .single()

      if (productError) {
        results.errors.push(`${product.name}: ${productError.message}`)
        continue
      }

      // Insert specs
      const hasSpecs = Object.values(specs).some(v => v !== null && v !== false)
      if (hasSpecs) {
        await supabaseAdmin
          .from('product_specifications')
          .insert({ product_id: inserted.id, ...specs })
      }

      results.inserted++
    } catch (err) {
      results.errors.push(`Row error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({ success: true, ...results })
}
