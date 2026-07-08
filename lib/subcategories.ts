import { supabaseAdmin } from './supabase'

// ============================================================
// Resolve a subcategory for a product save.
//
// - If an existing subcategoryId is supplied, it is used as-is.
// - If a free-text subcategoryName is supplied instead, we find an
//   existing subcategory with that name under the category (case-
//   insensitive) or create a new one. Newly created subcategories
//   then appear in the dropdown for all future products (Phase 1.1).
//
// Returns the resolved subcategory id, or null when none applies.
// ============================================================

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function resolveSubcategoryId(
  categoryId: string | null | undefined,
  opts: { subcategoryId?: string | null; subcategoryName?: string | null }
): Promise<string | null> {
  const { subcategoryId, subcategoryName } = opts

  if (subcategoryId) return subcategoryId

  const name = subcategoryName?.trim()
  if (!name || !categoryId) return null

  // Look for an existing subcategory with this name under the category.
  const { data: existing } = await supabaseAdmin
    .from('subcategories')
    .select('id')
    .eq('category_id', categoryId)
    .ilike('name', name)
    .maybeSingle()

  if (existing?.id) return existing.id

  // Create it. Ensure a unique slug (fall back with a numeric suffix).
  const base = slugify(name) || 'subcategory'
  let slug = base
  for (let i = 2; i <= 20; i++) {
    const { data: clash } = await supabaseAdmin
      .from('subcategories')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!clash) break
    slug = `${base}-${i}`
  }

  const { data: created, error } = await supabaseAdmin
    .from('subcategories')
    .insert({ category_id: categoryId, name, slug })
    .select('id')
    .single()

  if (error || !created) return null
  return created.id
}
