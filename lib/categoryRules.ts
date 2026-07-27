// ============================================================
// Category visibility RULES — pure, dependency-free predicates.
//
// Deliberately free of `server-only`, Supabase or Next imports so the
// rule that decides whether a product is publicly reachable can be unit
// tested directly (tests/categoryVisibility.test.ts). The server helpers
// in lib/categoryVisibility.ts re-export these and add the querying.
// ============================================================

export interface CategoryVisibilityFields {
  is_visible?: boolean | null
  archived_at?: string | null
}

export interface ProductCategoryFields {
  visibility?: string | null
  archived_at?: string | null
  deleted_at?: string | null
  category_id?: string | null
  /**
   * supabase-js types an embedded resource as an array even when the
   * relationship is many-to-one (where PostgREST actually returns a single
   * object), so both shapes are accepted and normalised.
   */
  category?: CategoryVisibilityFields | CategoryVisibilityFields[] | null
}

/** Normalise PostgREST's object-or-array embed into a single row. */
function firstCategory(
  cat: CategoryVisibilityFields | CategoryVisibilityFields[] | null | undefined,
): CategoryVisibilityFields | null {
  if (!cat) return null
  return Array.isArray(cat) ? (cat[0] ?? null) : cat
}

/** Roles that see the catalogue unfiltered by category visibility. */
export function bypassesCategoryVisibility(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'staff'
}

/**
 * A category is public only while it is visible AND not archived.
 * "Hidden" and "archived" are identical to the public site; they differ
 * only in the admin lifecycle (archived also leaves active pickers).
 */
export function categoryIsPublic(
  cat: CategoryVisibilityFields | CategoryVisibilityFields[] | null | undefined,
): boolean {
  const row = firstCategory(cat)
  if (!row) return false
  return row.is_visible !== false && row.archived_at == null
}

/**
 * Does this product's category permit it on the public site?
 *
 *  • no category at all      → true  (nothing hidden to inherit)
 *  • category public         → true
 *  • category hidden/archived→ false (every surface, direct URL included)
 *  • category_id set but the joined row missing → false, so a dangling
 *    reference fails closed rather than leaking a product.
 *
 * This is only the CATEGORY gate. Callers still apply the product's own
 * published/archived/deleted and audience gates.
 */
export function productCategoryIsPublic(product: ProductCategoryFields): boolean {
  if (!product.category_id) return true
  return categoryIsPublic(product.category)
}

/**
 * Full public-reachability decision for a single product row, combining
 * the product's own state with the category gate. Mirrors what the
 * server queries enforce in SQL.
 */
export function productIsPubliclyReachable(
  product: ProductCategoryFields,
  role?: string | null,
): boolean {
  if (bypassesCategoryVisibility(role)) return true
  const ownStateOk =
    product.visibility === 'published' &&
    !product.archived_at &&
    !product.deleted_at
  if (!ownStateOk) return false
  return productCategoryIsPublic(product)
}
