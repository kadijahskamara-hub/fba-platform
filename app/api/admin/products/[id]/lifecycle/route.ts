import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

// ============================================================
// Product lifecycle actions (admin brief §3):
//   POST { action: 'archive' | 'unarchive' | 'publish' | 'unpublish' | 'duplicate' }
//   POST { action: 'delete', confirm: 'DELETE', reason?: string }  — admin only
//
// Archive is the default removal path. Hard delete is blocked
// when dependent records exist (project items, quote items,
// order items, import batch items) unless override: true (admin).
// ============================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type LifecycleAction = 'archive' | 'unarchive' | 'publish' | 'unpublish' | 'draft' | 'clear' | 'duplicate' | 'delete'
const ACTIONS: LifecycleAction[] = ['archive', 'unarchive', 'publish', 'unpublish', 'draft', 'clear', 'duplicate', 'delete']

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ success: false, error: 'Invalid product id' }, { status: 400 })
  }

  let body: { action?: string; confirm?: string; reason?: string; override?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action as LifecycleAction
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
  }

  // Hard delete is admin-only
  if (action === 'delete' && session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Only admins can permanently delete products' }, { status: 403 })
  }

  const { data: product, error: fetchError } = await supabaseAdmin
    .from('products')
    .select('id, name, slug, visibility, archived_at, deleted_at')
    .eq('id', params.id)
    .single()

  if (fetchError || !product) {
    return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 })
  }

  const now = new Date().toISOString()

  switch (action) {
    case 'archive': {
      const { error } = await supabaseAdmin
        .from('products')
        .update({ archived_at: now, archived_by: session.id, last_updated_by: session.id, updated_at: now })
        .eq('id', product.id)
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

      await logAudit({ actor: session, action: 'product.archived', entityType: 'product', entityId: product.id, before: { archived_at: product.archived_at }, after: { archived_at: now } })
      return NextResponse.json({ success: true, message: `"${product.name}" archived. It is now hidden from the public catalogue but retained for admin history, project boards, imports, and quote references.` })
    }

    case 'unarchive': {
      const { error } = await supabaseAdmin
        .from('products')
        .update({ archived_at: null, archived_by: null, last_updated_by: session.id, updated_at: now })
        .eq('id', product.id)
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

      await logAudit({ actor: session, action: 'product.restored', entityType: 'product', entityId: product.id })
      return NextResponse.json({ success: true, message: `"${product.name}" restored.` })
    }

    case 'publish':
    case 'unpublish': {
      const visibility = action === 'publish' ? 'published' : 'draft'
      const { error } = await supabaseAdmin
        .from('products')
        .update({ visibility, last_updated_by: session.id, updated_at: now })
        .eq('id', product.id)
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

      await logAudit({ actor: session, action: `product.${action}ed`, entityType: 'product', entityId: product.id, before: { visibility: product.visibility }, after: { visibility } })
      return NextResponse.json({ success: true, message: `"${product.name}" ${action}ed.` })
    }

    case 'draft': {
      const { error } = await supabaseAdmin
        .from('products')
        .update({ visibility: 'draft', last_updated_by: session.id, updated_at: now })
        .eq('id', product.id)
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

      await logAudit({ actor: session, action: 'product.drafted', entityType: 'product', entityId: product.id, before: { visibility: product.visibility }, after: { visibility: 'draft' } })
      return NextResponse.json({ success: true, message: `"${product.name}" moved to Draft.` })
    }

    case 'clear': {
      // Reset a product to a blank draft: wipe all editable content but keep
      // the record's identity (id, name, slug) so links and references survive.
      const cleared: Record<string, unknown> = {
        description: '', short_description: null,
        category_id: null, subcategory_id: null, artisan_id: null,
        retail_price: null, trade_price: null, supplier_cost: null,
        price_type: 'fixed',
        images: [], seo_title: null, seo_description: null,
        reference_code: null, sku: null,
        lead_time: null, lead_time_weeks: null,
        shipping_origin: null, shipping_notes: null,
        technical_description: null, customisation_note: null,
        made_to_order: null, dispatch_time_label: null,
        lead_time_min_weeks: null, lead_time_max_weeks: null,
        min_order_quantity: null, public_brand_visible: null, hide_finish_options: null,
        is_fba_collection: false, is_fba_home: false,
        fire_retardant: false, stain_proofed: false, rub_count_40k: false,
        finish_type: null, origin_region: null,
        visibility: 'draft',
        last_updated_by: session.id, updated_at: now,
      }
      const { error } = await supabaseAdmin
        .from('products')
        .update(cleared)
        .eq('id', product.id)
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

      // Remove dependent detail records (specs, variants, finishes, documents).
      await supabaseAdmin.from('product_specifications').delete().eq('product_id', product.id)
      await supabaseAdmin.from('product_variants').delete().eq('product_id', product.id)
      await supabaseAdmin.from('product_finishes').delete().eq('product_id', product.id)
      await supabaseAdmin.from('product_documents').delete().eq('product_id', product.id)

      await logAudit({ actor: session, action: 'product.cleared', entityType: 'product', entityId: product.id, before: { name: product.name, visibility: product.visibility }, after: { reset: true } })
      return NextResponse.json({ success: true, message: `"${product.name}" reset to a blank draft. Its name and link are kept; all other fields were cleared.` })
    }

    case 'duplicate': {
      const { data: full, error: fullError } = await supabaseAdmin
        .from('products')
        .select('*')
        .eq('id', product.id)
        .single()
      if (fullError || !full) return NextResponse.json({ success: false, error: 'Could not load product' }, { status: 500 })

      const copy: Record<string, unknown> = { ...full }
      delete copy.id
      delete copy.created_at
      delete copy.updated_at
      copy.name = `${full.name} (Copy)`
      copy.slug = `${full.slug}-copy-${Date.now().toString(36)}`
      copy.sku = null
      copy.visibility = 'draft'
      copy.archived_at = null
      copy.archived_by = null
      copy.deleted_at = null
      copy.deleted_by = null
      copy.delete_reason = null
      copy.source_type = 'manual'
      copy.source_batch_id = null
      copy.source_hash = null
      copy.source_row_id = null
      copy.last_imported_at = null
      copy.last_import_mode = null
      copy.last_updated_by = session.id

      const { data: created, error: insertError } = await supabaseAdmin
        .from('products')
        .insert(copy)
        .select('id, slug')
        .single()
      if (insertError || !created) return NextResponse.json({ success: false, error: insertError?.message ?? 'Duplicate failed' }, { status: 500 })

      // Copy specifications and finishes/variants/documents
      const { data: spec } = await supabaseAdmin
        .from('product_specifications')
        .select('*')
        .eq('product_id', product.id)
        .maybeSingle()
      if (spec) {
        const specCopy: Record<string, unknown> = { ...spec, product_id: created.id }
        delete specCopy.id
        await supabaseAdmin.from('product_specifications').insert(specCopy)
      }
      for (const table of ['product_variants', 'product_finishes', 'product_documents'] as const) {
        const { data: rows } = await supabaseAdmin.from(table).select('*').eq('product_id', product.id)
        if (rows && rows.length > 0) {
          const copies = rows.map((r: Record<string, unknown>) => {
            const c: Record<string, unknown> = { ...r, product_id: created.id }
            delete c.id
            return c
          })
          await supabaseAdmin.from(table).insert(copies)
        }
      }

      await logAudit({ actor: session, action: 'product.duplicated', entityType: 'product', entityId: created.id, before: { from: product.id } })
      return NextResponse.json({ success: true, message: `Duplicated as draft "${product.name} (Copy)".`, data: created })
    }

    case 'delete': {
      if (body.confirm !== 'DELETE') {
        return NextResponse.json({ success: false, error: 'Type DELETE to confirm permanent deletion. Use Archive unless this is a mistaken test product or duplicate import.' }, { status: 400 })
      }

      // Dependency check — block hard delete when references exist
      const [projectItems, quoteItems, orderItems, importItems] = await Promise.all([
        supabaseAdmin.from('project_items').select('id', { count: 'exact', head: true }).eq('product_id', product.id),
        supabaseAdmin.from('quote_request_items').select('id', { count: 'exact', head: true }).eq('product_id', product.id),
        supabaseAdmin.from('retail_order_items').select('id', { count: 'exact', head: true }).eq('product_id', product.id),
        supabaseAdmin.from('import_batch_items').select('id', { count: 'exact', head: true }).eq('product_id', product.id),
      ])

      const deps = {
        projectItems: projectItems.count ?? 0,
        quoteItems: quoteItems.count ?? 0,
        orderItems: orderItems.count ?? 0,
        importItems: importItems.count ?? 0,
      }
      const hasDeps = deps.projectItems + deps.quoteItems + deps.orderItems > 0

      if (hasDeps && body.override !== true) {
        return NextResponse.json({
          success: false,
          error: 'This product is referenced by saved projects, quotes, or orders. Archive it instead, or resend with override to force deletion.',
          dependencies: deps,
        }, { status: 409 })
      }

      // Soft-mark first (audit trail), then hard delete
      await logAudit({
        actor: session,
        action: 'product.deleted',
        entityType: 'product',
        entityId: product.id,
        before: { name: product.name, slug: product.slug, dependencies: deps },
        after: { reason: body.reason ?? null, override: body.override === true },
      })

      const { error } = await supabaseAdmin.from('products').delete().eq('id', product.id)
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

      return NextResponse.json({ success: true, message: `"${product.name}" permanently deleted.` })
    }
  }
}
