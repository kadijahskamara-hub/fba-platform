import 'server-only'

// ============================================================
// Category visibility — single source of truth (July 2026 spec §5)
//
// A category is PUBLIC when   is_visible = true AND archived_at IS NULL.
// A category is NON-PUBLIC when is_visible = false OR archived_at IS NOT NULL
// ("hidden" and "archived" behave identically for the public site; they
// differ only in the admin lifecycle).
//
// Product rule (products.category_id is a single FK in this schema, so
// "all of a product's categories" collapses to its one category):
//   • category_id IS NULL          → visible (no hidden category to inherit)
//   • category is public           → visible (subject to the usual
//                                     visibility / archived / audience gates)
//   • category is hidden/archived  → NOT visible on ANY public surface,
//                                     including its direct product URL.
//
// Superseding the earlier rule: hidden-category products used to stay
// reachable by direct link. They no longer are — hiding a category removes
// its products from the public site completely (spec §5, Darlo 2026-07-27).
//
// Staff (admin/staff) bypass all of this so the admin catalogue is
// unaffected and records remain fully editable.
// ============================================================

import { supabaseAdmin } from '@/lib/supabase'

// The rules themselves live in lib/categoryRules.ts — pure and unit
// tested. This module adds the querying and cache-invalidation around
// them, and re-exports them so callers only need one import.
export {
  bypassesCategoryVisibility,
  categoryIsPublic,
  productCategoryIsPublic,
  productIsPubliclyReachable,
} from '@/lib/categoryRules'

import { bypassesCategoryVisibility } from '@/lib/categoryRules'

/**
 * IDs of every category that must not surface publicly.
 * Returns [] when nothing is hidden, so callers can skip filtering.
 */
export async function getNonPublicCategoryIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id')
    .or('is_visible.eq.false,archived_at.not.is.null')
  // Fail open rather than emptying the catalogue on a transient DB error:
  // a missed hide is recoverable, a blank shop is not.
  if (error) return []
  return (data ?? []).map(c => c.id as string)
}

/**
 * Chainable filter: drop products whose category is hidden or archived.
 * Products with no category are kept (they inherit nothing).
 * No-op for staff roles and when nothing is hidden.
 */
// Constraint style matches applyPublicProductFilter / applyAudienceFilter in
// lib/productVisibility.ts: `or` is loosely typed so any supabase-js filter
// builder chains cleanly without fighting its recursive generics.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyCategoryVisibilityFilter<T extends { or: any }>(
  query: T,
  hiddenCategoryIds: string[],
  role?: string | null,
): T {
  if (bypassesCategoryVisibility(role)) return query
  if (hiddenCategoryIds.length === 0) return query
  return query.or(`category_id.is.null,category_id.not.in.(${hiddenCategoryIds.join(',')})`) as T
}

/**
 * The hidden-category set for a given role: [] for staff (who bypass the
 * rule) or when nothing is hidden. Feed the result into
 * applyCategoryVisibilityFilter.
 *
 * NOTE: there is deliberately no `async` helper that takes a query and
 * returns the modified query. A supabase-js builder is itself thenable,
 * so `await helper(query)` would resolve the BUILDER and fire the query
 * before the remaining filters, sort and range were attached. Fetch the
 * ids first, then apply the filter synchronously.
 */
export async function hiddenCategoryIdsFor(role?: string | null): Promise<string[]> {
  if (bypassesCategoryVisibility(role)) return []
  return getNonPublicCategoryIds()
}

/**
 * Look up a single category by slug and report whether it is browsable
 * publicly. `exists: false` means no such slug.
 */
export async function resolvePublicCategoryBySlug(slug: string): Promise<{
  exists: boolean
  id: string | null
  isPublic: boolean
}> {
  const { data } = await supabaseAdmin
    .from('categories')
    .select('id, is_visible, archived_at')
    .eq('slug', slug)
    .maybeSingle()
  if (!data) return { exists: false, id: null, isPublic: false }
  return {
    exists: true,
    id: data.id as string,
    isPublic: data.is_visible !== false && data.archived_at == null,
  }
}

/**
 * Public routes whose cached output depends on which categories are
 * visible. Revalidated whenever a category is hidden, published,
 * archived, restored, reordered or deleted so the change is live without
 * a redeploy.
 */
export const CATEGORY_DEPENDENT_PATHS = [
  '/',
  '/products',
  '/collection',
  '/home',
  '/sitemap.xml',
] as const
