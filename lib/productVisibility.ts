import 'server-only'

// ============================================================
// Single source of truth for "publicly visible product".
// A product appears on public pages iff:
//   visibility = 'published' AND archived_at IS NULL AND deleted_at IS NULL
// RLS enforces this for the anon client; these helpers keep
// service-role (supabaseAdmin) queries consistent with RLS.
// ============================================================

/**
 * Chainable filter for supabase-js queries.
 * Usage: applyPublicProductFilter(supabase.from('products').select('*'))
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyPublicProductFilter<T extends { eq: any; is: any }>(query: T): T {
  return query
    .eq('visibility', 'published')
    .is('archived_at', null)
    .is('deleted_at', null) as T
}

/** Row-level check for already-fetched product records. */
export function isPubliclyVisible(p: {
  visibility?: string | null
  archived_at?: string | null
  deleted_at?: string | null
}): boolean {
  return p.visibility === 'published' && !p.archived_at && !p.deleted_at
}

// ── Audience visibility (role → allowed audiences) ───────────
// Mirrors isProductVisibleTo() in lib/pricing.ts EXACTLY, but as a
// SQL-level filter so a product COUNT and the product LIST always
// agree. Previously counts were computed in SQL while the list was
// filtered by audience in JS, so e.g. a guest saw "4 pieces" but only
// 1 card when 3 were trade-only.
//   • admin           → sees every audience (null = no filter)
//   • trade_user      → trade + retail_and_trade  (not retail-only)
//   • everyone else   → retail + retail_and_trade (not trade-only)
export function visibleAudiencesFor(role: string | null | undefined): string[] | null {
  if (role === 'admin') return null
  if (role === 'trade_user') return ['trade', 'retail_and_trade']
  return ['retail', 'retail_and_trade']
}

/** Chainable audience filter for supabase-js queries. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyAudienceFilter<T extends { in: any }>(query: T, role: string | null | undefined): T {
  const audiences = visibleAudiencesFor(role)
  return audiences ? (query.in('audience', audiences) as T) : query
}
