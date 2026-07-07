import { supabaseAdmin } from '@/lib/supabase'

// ============================================================
// Live studio stats — single source of truth for the counters
// shown on the homepage and the About page (fix A1/A4).
// Counts update automatically as the catalogue changes; pages
// using this must export `revalidate` so Next.js refreshes them.
// ============================================================

export interface LiveStat {
  value: string
  label: string
}

/** Derive a clean country name from free-text origins like "Valencia, Spain". */
function countryOf(raw: string | null): string | null {
  if (!raw) return null
  const last = raw.split(',').pop()?.trim()
  if (!last || last.length < 3) return null
  return last.replace(/\b\w/g, ch => ch.toUpperCase())
}

export async function getLiveStats(): Promise<{ stats: LiveStat[]; countries: string[] }> {
  const [
    { count: productCount },
    { count: artisanCount },
    { data: originRows },
    { data: artisanRows },
  ] = await Promise.all([
    supabaseAdmin.from('products').select('*', { count: 'exact', head: true })
      .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null),
    supabaseAdmin.from('artisans').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabaseAdmin.from('products').select('shipping_origin, origin_region')
      .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null).limit(2000),
    supabaseAdmin.from('artisans').select('location').eq('is_active', true),
  ])

  const countrySet = new Set<string>()
  for (const r of originRows ?? []) {
    const c1 = countryOf(r.shipping_origin) ?? countryOf(r.origin_region)
    if (c1) countrySet.add(c1)
  }
  for (const a of artisanRows ?? []) {
    const c1 = countryOf(a.location)
    if (c1) countrySet.add(c1)
  }
  const countries = [...countrySet].sort()

  return {
    countries,
    stats: [
      { value: String(artisanCount ?? 0), label: 'Maker Studios in the Network' },
      { value: String(countries.length),  label: 'Countries of Origin' },
      { value: String(productCount ?? 0), label: 'Products in the Edit' },
    ],
  }
}
