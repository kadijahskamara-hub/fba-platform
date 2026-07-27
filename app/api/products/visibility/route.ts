import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import {
  applyCategoryVisibilityFilter,
  bypassesCategoryVisibility,
  getNonPublicCategoryIds,
} from '@/lib/categoryVisibility'
import { applyAudienceFilter } from '@/lib/productVisibility'

// ============================================================
// Which of these product slugs are still publicly reachable?
//
// Exists for client-held lists that the server cannot filter at render
// time — currently the localStorage "Recently viewed" strip (spec §5:
// hidden products must not survive as client-side-only navigation).
//
// Read-only and leak-free: it only ever echoes back a subset of the
// slugs the caller already supplied, never names, prices or new records.
// ============================================================

const MAX_SLUGS = 24
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/i

export async function GET(req: NextRequest) {
  const session = await getSession()
  const raw = req.nextUrl.searchParams.get('slugs') ?? ''

  const slugs = Array.from(new Set(
    raw.split(',').map(s => s.trim()).filter(s => SLUG_RE.test(s)),
  )).slice(0, MAX_SLUGS)

  if (slugs.length === 0) {
    return NextResponse.json({ success: true, data: { visible: [] } })
  }

  let query = supabaseAdmin
    .from('products')
    .select('slug')
    .in('slug', slugs)
    .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null)

  query = applyAudienceFilter(query, session?.role)

  if (!bypassesCategoryVisibility(session?.role)) {
    const hidden = await getNonPublicCategoryIds()
    query = applyCategoryVisibilityFilter(query, hidden, session?.role)
  }

  const { data, error } = await query
  if (error) {
    // Fail open: a transient error should not blank the visitor's history.
    return NextResponse.json({ success: true, data: { visible: slugs } })
  }

  return NextResponse.json({
    success: true,
    data: { visible: (data ?? []).map(r => r.slug as string) },
  })
}
