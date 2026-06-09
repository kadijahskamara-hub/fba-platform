import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session    = await getSession()
  const { searchParams } = req.nextUrl
  const collection = searchParams.get('collection') === 'true'

  const client = session?.role === 'admin' ? supabaseAdmin : supabase

  let query = client
    .from('products')
    .select('artisan_id, material, retail_price, finish_type, origin_region, lead_time_weeks, artisan:artisans(id, name, slug)')
    .eq('visibility', 'published')

  if (collection) {
    query = query.eq('is_fba_collection', true) as typeof query
  }

  const { data: products } = await query

  if (!products) {
    return NextResponse.json({
      artisans:    [],
      materials:   [],
      finishTypes: [],
      regions:     [],
      priceRange:  { min: 0, max: 10000 },
      leadTimeMax: 24,
    })
  }

  // Distinct artisans
  const artisanMap = new Map<string, { id: string; name: string; slug: string }>()
  for (const p of products) {
    if (p.artisan_id && p.artisan) {
      const a = p.artisan as unknown as { id: string; name: string; slug: string }
      if (a.id && a.name) artisanMap.set(a.id, a)
    }
  }
  const artisans = Array.from(artisanMap.values()).sort((a, b) => a.name.localeCompare(b.name))

  // Distinct non-empty materials
  const materialSet = new Set<string>()
  for (const p of products) {
    const m = (p as Record<string, unknown>).material as string | null
    if (m && m.trim()) materialSet.add(m.trim())
  }
  const materials = Array.from(materialSet).sort()

  // Distinct finish types
  const finishSet = new Set<string>()
  for (const p of products) {
    const f = (p as Record<string, unknown>).finish_type as string | null
    if (f && f.trim()) finishSet.add(f.trim())
  }
  const finishTypes = Array.from(finishSet).sort()

  // Distinct regions
  const regionSet = new Set<string>()
  for (const p of products) {
    const r = (p as Record<string, unknown>).origin_region as string | null
    if (r && r.trim()) regionSet.add(r.trim())
  }
  const regions = Array.from(regionSet).sort()

  // Retail price range
  const prices = products
    .map(p => (p as Record<string, unknown>).retail_price as number | null)
    .filter((v): v is number => v != null && v > 0)

  const priceRange = prices.length
    ? { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) }
    : { min: 0, max: 10000 }

  // Max lead time weeks
  const leadTimes = products
    .map(p => (p as Record<string, unknown>).lead_time_weeks as number | null)
    .filter((v): v is number => v != null && v > 0)

  const leadTimeMax = leadTimes.length ? Math.max(...leadTimes) : 24

  return NextResponse.json({ artisans, materials, finishTypes, regions, priceRange, leadTimeMax })
}
