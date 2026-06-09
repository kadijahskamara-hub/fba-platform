// Server-only sync engine — uses supabaseAdmin, never import this in 'use client' components.
// Client-safe types & constants are in lib/syncEngineTypes.ts
import { supabaseAdmin } from './supabase'
export type { SourceType, BrandIntegration, SyncResult, FieldMappings } from './syncEngineTypes'
export { DEFAULT_MAPPINGS } from './syncEngineTypes'
import type { FieldMappings, BrandIntegration, SyncResult } from './syncEngineTypes'
import { DEFAULT_MAPPINGS } from './syncEngineTypes'

// ── SSRF guard ───────────────────────────────────────────────────
/**
 * Validate that a URL is a public HTTPS endpoint.
 * Rejects private/loopback IP ranges, non-HTTPS schemes, and empty values.
 * This prevents server-side request forgery via admin-configured endpoints.
 */
function isAllowedEndpoint(url: string): boolean {
  if (!url) return false
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol !== 'https:') return false
    // Block loopback
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false
    // Block private IPv4 ranges: 10.x, 172.16-31.x, 192.168.x, 169.254.x (link-local / AWS metadata)
    if (/^(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+)$/.test(hostname)) {
      return false
    }
    return true
  } catch {
    return false
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function slugify(str: string): string {
  return str.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Resolve a dot-path against an object.
 * Supports: "key", "a.b.c", "arr.0.field", "arr.*.field"
 */
function resolvePath(obj: unknown, path: string): unknown {
  if (!path || obj === null || obj === undefined) return undefined
  const parts = path.split('.')
  let cur: unknown = obj

  for (let i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return undefined
    const part = parts[i]

    if (part === '*') {
      // Wildcard — collect the next field from each array element
      if (!Array.isArray(cur)) return undefined
      const rest = parts.slice(i + 1).join('.')
      return cur.map(item => rest ? resolvePath(item, rest) : item)
    }

    if (Array.isArray(cur)) {
      const idx = parseInt(part, 10)
      cur = isNaN(idx) ? (cur as Record<string, unknown>[])[0]?.[part] : cur[idx]
    } else {
      cur = (cur as Record<string, unknown>)[part]
    }
  }
  return cur
}

function resolveImages(obj: unknown, path: string): string[] {
  const val = resolvePath(obj, path)
  if (Array.isArray(val)) {
    return (val as unknown[]).filter(v => typeof v === 'string') as string[]
  }
  if (typeof val === 'string' && val) return [val]
  return []
}

function mapProduct(raw: unknown, mappings: FieldMappings): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [fbaField, sourcePath] of Object.entries(mappings)) {
    if (fbaField === 'images') {
      result.images = resolveImages(raw, sourcePath)
    } else {
      let val = resolvePath(raw, sourcePath)
      if (typeof val === 'string' && (fbaField === 'description' || fbaField === 'short_description')) {
        val = stripHtml(val)
      }
      if (val !== undefined && val !== null && val !== '') {
        result[fbaField] = val
      }
    }
  }
  return result
}

async function generateUniqueSlug(base: string): Promise<string> {
  const slug = slugify(base) || 'product'
  const { data } = await supabaseAdmin
    .from('products')
    .select('slug')
    .ilike('slug', `${slug}%`)
    .limit(30)
  const existing = new Set((data ?? []).map(r => r.slug as string))
  if (!existing.has(slug)) return slug
  let i = 2
  while (existing.has(`${slug}-${i}`)) i++
  return `${slug}-${i}`
}

// ── CSV parser ───────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0])
  const result: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] ?? '').trim() })
    if (Object.values(row).some(v => v)) result.push(row)
  }
  return result
}

// ── Fetch raw products from source ──────────────────────────────
async function fetchRawProducts(integration: BrandIntegration): Promise<unknown[]> {
  const { source_type, api_endpoint, api_key, api_secret } = integration

  if (source_type === 'shopify') {
    if (!api_endpoint || !api_key) throw new Error('Shopify requires endpoint + access token')
    if (!isAllowedEndpoint(api_endpoint)) throw new Error('Shopify endpoint must be a public HTTPS URL')
    const base = api_endpoint.replace(/\/$/, '')
    const url = `${base}/admin/api/2024-01/products.json?limit=250`
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': api_key } })
    if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text()}`)
    const json = await res.json() as { products: unknown[] }
    return json.products ?? []

  } else if (source_type === 'woocommerce') {
    if (!api_endpoint || !api_key || !api_secret) throw new Error('WooCommerce requires endpoint, key, and secret')
    if (!isAllowedEndpoint(api_endpoint)) throw new Error('WooCommerce endpoint must be a public HTTPS URL')
    const base = api_endpoint.replace(/\/$/, '')
    const params = new URLSearchParams({ per_page: '100', consumer_key: api_key, consumer_secret: api_secret })
    const res = await fetch(`${base}/wp-json/wc/v3/products?${params}`)
    if (!res.ok) throw new Error(`WooCommerce API ${res.status}: ${await res.text()}`)
    return await res.json() as unknown[]

  } else if (source_type === 'csv_url') {
    if (!api_endpoint) throw new Error('CSV URL is required')
    if (!isAllowedEndpoint(api_endpoint)) throw new Error('CSV URL must be a public HTTPS URL')
    const headers: Record<string, string> = {}
    if (api_key) headers['Authorization'] = `Bearer ${api_key}`
    const res = await fetch(api_endpoint, { headers })
    if (!res.ok) throw new Error(`CSV fetch ${res.status}`)
    return parseCSV(await res.text())

  } else {
    // Generic REST API
    if (!api_endpoint) throw new Error('API endpoint is required')
    if (!isAllowedEndpoint(api_endpoint)) throw new Error('API endpoint must be a public HTTPS URL')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (api_key) headers['Authorization'] = `Bearer ${api_key}`
    const res = await fetch(api_endpoint, { headers })
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
    const json = await res.json() as unknown
    if (Array.isArray(json)) return json
    const obj = json as Record<string, unknown>
    const products = obj.products ?? obj.items ?? obj.data ?? obj.results
    if (Array.isArray(products)) return products
    throw new Error('Could not find products array in API response. Check field mappings.')
  }
}

// ── Main sync function ───────────────────────────────────────────
export async function syncIntegration(integrationId: string): Promise<SyncResult> {
  const { data: integration, error } = await supabaseAdmin
    .from('brand_integrations')
    .select('*')
    .eq('id', integrationId)
    .single()

  if (error || !integration) throw new Error('Integration not found')

  const rawProducts = await fetchRawProducts(integration as BrandIntegration)
  const mappings = integration.field_mappings as FieldMappings

  let imported = 0, skipped = 0
  const errors: string[] = []

  for (const raw of rawProducts) {
    try {
      const mapped = mapProduct(raw, mappings)
      const name = (mapped.name as string | undefined)?.trim()
      if (!name) { skipped++; continue }

      const slug = await generateUniqueSlug(name)
      const retailPrice = mapped.retail_price ? parseFloat(String(mapped.retail_price)) : null

      const { error: insertErr } = await supabaseAdmin.from('products').insert({
        name,
        slug,
        description:       (mapped.description as string)       ?? '',
        short_description: (mapped.short_description as string) ?? null,
        retail_price:      isNaN(retailPrice ?? NaN) ? null : retailPrice,
        sku:               (mapped.sku as string)               ?? null,
        images:            (mapped.images as string[])          ?? [],
        lead_time:         (mapped.lead_time as string)         ?? null,
        shipping_origin:   (mapped.shipping_origin as string)   ?? null,
        visibility:        'draft',
        price_type:        'fixed',
        currency:          'GBP',
        is_fba_collection: false,
      })

      if (insertErr) {
        errors.push(`"${name}": ${insertErr.message}`)
        skipped++
      } else {
        imported++
      }
    } catch (e) {
      errors.push(String(e))
      skipped++
    }
  }

  await supabaseAdmin.from('brand_integrations').update({
    last_synced_at:    new Date().toISOString(),
    last_sync_status:  errors.length === 0 ? 'success' : (imported > 0 ? 'partial' : 'error'),
    last_sync_message: errors.length > 0
      ? errors.slice(0, 5).join(' | ')
      : `${imported} product${imported !== 1 ? 's' : ''} imported`,
    products_imported: (integration.products_imported ?? 0) + imported,
    updated_at:        new Date().toISOString(),
  }).eq('id', integrationId)

  return { imported, skipped, errors }
}

// ── Sync from pre-parsed CSV rows (for manual upload) ───────────
export async function syncFromRows(
  integrationId: string,
  rows: Record<string, string>[]
): Promise<SyncResult> {
  const { data: integration } = await supabaseAdmin
    .from('brand_integrations')
    .select('*')
    .eq('id', integrationId)
    .single()

  const mappings = (integration?.field_mappings ?? DEFAULT_MAPPINGS.manual_csv) as FieldMappings
  let imported = 0, skipped = 0
  const errors: string[] = []

  for (const row of rows) {
    try {
      const mapped = mapProduct(row, mappings)
      const name = (mapped.name as string | undefined)?.trim()
      if (!name) { skipped++; continue }

      const slug = await generateUniqueSlug(name)
      const retailPrice = mapped.retail_price ? parseFloat(String(mapped.retail_price)) : null

      const { error: insertErr } = await supabaseAdmin.from('products').insert({
        name,
        slug,
        description:       (mapped.description as string)     ?? '',
        retail_price:      isNaN(retailPrice ?? NaN) ? null : retailPrice,
        sku:               (mapped.sku as string)             ?? null,
        images:            (mapped.images as string[])        ?? [],
        lead_time:         (mapped.lead_time as string)       ?? null,
        shipping_origin:   (mapped.shipping_origin as string) ?? null,
        visibility:        'draft',
        price_type:        'fixed',
        currency:          'GBP',
        is_fba_collection: false,
      })

      if (insertErr) { errors.push(`"${name}": ${insertErr.message}`); skipped++ }
      else imported++
    } catch (e) {
      errors.push(String(e)); skipped++
    }
  }

  if (integration) {
    await supabaseAdmin.from('brand_integrations').update({
      last_synced_at:    new Date().toISOString(),
      last_sync_status:  errors.length === 0 ? 'success' : (imported > 0 ? 'partial' : 'error'),
      last_sync_message: errors.length > 0 ? errors.slice(0, 5).join(' | ') : `${imported} products imported via CSV`,
      products_imported: (integration.products_imported ?? 0) + imported,
      updated_at:        new Date().toISOString(),
    }).eq('id', integrationId)
  }

  return { imported, skipped, errors }
}
