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
