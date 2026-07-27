import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { CATEGORY_DEPENDENT_PATHS } from '@/lib/categoryVisibility'

/**
 * Drop the cached output of every public surface whose contents depend on
 * category visibility, plus the whole /products/[slug] segment (a hidden
 * category turns its product pages into 404s and re-publishing restores
 * them). Failures are swallowed: a stale cache must never fail the write
 * that already succeeded in the database.
 */
function revalidateCatalogue(): void {
  try {
    for (const path of CATEGORY_DEPENDENT_PATHS) revalidatePath(path)
    revalidatePath('/products/[slug]', 'page')
    revalidatePath('/artisans/[slug]', 'page')
  } catch (err) {
    console.error('Category revalidation failed (data was saved):', err)
  }
}

// ============================================================
// Category lifecycle (final amendments §5)
//
// PATCH  — publish/hide, archive/restore, reorder, rename.
//          Hidden or archived categories leave every public
//          catalogue surface — navigation, filters, listings,
//          search, recommendations, feeds AND the direct product
//          URL, which 404s while the category is hidden (spec §5,
//          superseding the earlier "reachable by link" rule).
//          Re-publishing restores everything without data loss.
// DELETE — permanent, admin-only. Blocked while products are
//          assigned unless a `reassignTo` category is supplied,
//          in which case products are moved first (their
//          subcategory link is cleared as it belongs to the old
//          category tree).
// ============================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })

  const { data: before } = await supabaseAdmin
    .from('categories').select('id, name, is_visible, archived_at, sort_order').eq('id', params.id).single()
  if (!before) return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (body.isVisible !== undefined) {
    if (typeof body.isVisible !== 'boolean') return NextResponse.json({ success: false, error: 'isVisible must be a boolean' }, { status: 400 })
    updates.is_visible = body.isVisible
  }
  if (body.archived !== undefined) {
    if (typeof body.archived !== 'boolean') return NextResponse.json({ success: false, error: 'archived must be a boolean' }, { status: 400 })
    updates.archived_at = body.archived ? new Date().toISOString() : null
    if (body.archived) updates.is_visible = false
  }
  if (body.sortOrder !== undefined) {
    const n = Number(body.sortOrder)
    if (!Number.isInteger(n) || n < 0 || n > 100000) return NextResponse.json({ success: false, error: 'sortOrder must be a non-negative integer' }, { status: 400 })
    updates.sort_order = n
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name || name.length > 120) return NextResponse.json({ success: false, error: 'Name must be 1–120 characters.' }, { status: 400 })
    updates.name = name
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 })
  }
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('categories').update(updates).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })

  await logAudit({
    actor: session, action: 'category.updated', entityType: 'category', entityId: params.id,
    before: { name: before.name, is_visible: before.is_visible, archived_at: before.archived_at, sort_order: before.sort_order },
    after: updates,
  })

  // Spec §5: a visibility change must show on the public site immediately —
  // no redeployment. Only revalidate when visibility actually moved, so a
  // rename or reorder does not needlessly dump the catalogue cache.
  const visibilityChanged =
    updates.is_visible !== undefined || updates.archived_at !== undefined
  if (visibilityChanged) revalidateCatalogue()

  return NextResponse.json({ success: true, data })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Only administrators can delete categories.' }, { status: 403 })
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as { reassignTo?: string } | null
  const reassignTo = body?.reassignTo && UUID_RE.test(body.reassignTo) ? body.reassignTo : null

  const { data: cat } = await supabaseAdmin
    .from('categories').select('id, name').eq('id', params.id).single()
  if (!cat) return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 })

  const { count: productCount } = await supabaseAdmin
    .from('products').select('id', { count: 'exact', head: true }).eq('category_id', params.id)

  if ((productCount ?? 0) > 0) {
    if (!reassignTo) {
      return NextResponse.json({
        success: false,
        error: `“${cat.name}” still has ${productCount} product(s). Choose a category to move them to, or hide/archive this category instead.`,
        data: { productCount },
      }, { status: 409 })
    }
    if (reassignTo === params.id) {
      return NextResponse.json({ success: false, error: 'Products cannot be reassigned to the category being deleted.' }, { status: 400 })
    }
    const { data: target } = await supabaseAdmin
      .from('categories').select('id, name').eq('id', reassignTo).single()
    if (!target) return NextResponse.json({ success: false, error: 'Reassignment category not found.' }, { status: 404 })

    // Move products; clear subcategory (it belongs to the old tree).
    const { error: moveErr } = await supabaseAdmin
      .from('products')
      .update({ category_id: reassignTo, subcategory_id: null })
      .eq('category_id', params.id)
    if (moveErr) {
      return NextResponse.json({ success: false, error: 'Reassignment failed — nothing was deleted.' }, { status: 500 })
    }
    await logAudit({
      actor: session, action: 'category.products_reassigned', entityType: 'category', entityId: params.id,
      before: { from: cat.name }, after: { to: target.name, moved: productCount },
    })
  }

  // Subcategories cascade via FK; products are already moved (or none).
  const { error } = await supabaseAdmin.from('categories').delete().eq('id', params.id)
  if (error) return NextResponse.json({ success: false, error: 'Delete failed.' }, { status: 500 })

  await logAudit({
    actor: session, action: 'category.deleted', entityType: 'category', entityId: params.id,
    before: { name: cat.name, productCount: productCount ?? 0, reassignedTo: reassignTo },
  })

  // Deletion changes navigation and (via reassignment) which products are
  // publicly listed, so the same surfaces need refreshing.
  revalidateCatalogue()

  return NextResponse.json({ success: true, data: { moved: productCount ?? 0 } })
}
