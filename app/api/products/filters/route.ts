import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import {
  applyCategoryVisibilityFilter,
  hiddenCategoryIdsFor,
} from '@/lib/categoryVisibility'

export async function GET(req: NextRequest) {
  const session    = await getSession()
  const { searchParams } = req.nextUrl
  const collection = searchParams.get('collection') === 'true'

  const client = session?.role === 'admin' ? supabaseAdmin : supabase

  let query = client
    .from('products')
    .select('artisan_id, material, retail_price, finish_type, origin_region, lead_time_weeks, artisan:artisans(id, name, slug)')
    .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null)

  if (collection) {
    query = query.eq('is_fba_collection', true) as typeof query
  }

  // Spec §5: filter facets are derived only from products the visitor can
  // actually reach, so hiding a category also removes its artisans,
  // materials, finishes and price extremes from the sidebar.
  const hiddenCategoryIds = await hiddenCategoryIdsFor(session?.role)
  query = applyCategoryVisibilityFilter(query, hiddenCategoryIds, session?.role)

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

  // Distinct finish types: legacy products.finish_type values PLUS the
  // material types of curated finish groups on published products
  // (Sprint 12 — backend-driven FINISH TYPE filter, md doc §2.2).
  const finishSet = new Set<string>()
  for (const p of products) {
    const f = (p as Record<string, unknown>).finish_type as string | null
    if (f && f.trim()) finishSet.add(f.trim())
  }
  const { data: groupTypes } = await supabaseAdmin
    .from('product_finish_groups')
    .select('material_type:material_types(name, is_active), product:products(visibility, archived_at, deleted_at)')
    .eq('is_active', true)
  for (const g of groupTypes ?? []) {
    const mt = g.material_type as unknown as { name?: string; is_active?: boolean } | null
    const pr = g.product as unknown as { visibility?: string; archived_at?: string | null; deleted_at?: string | null } | null
    if (mt?.name && mt.is_active !== false && pr?.visibility === 'published' && !pr.archived_at && !pr.deleted_at) {
      finishSet.add(mt.name)
    }
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
