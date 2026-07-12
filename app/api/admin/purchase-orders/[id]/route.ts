import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { recalcAndPersistPo } from '@/lib/commercial/purchaseOrders'
import { logAudit } from '@/lib/audit'
import { ValidationError, vUuid, vString, vNumber, vDate, vEnum } from '@/lib/commercial/validation'

// GET /api/admin/purchase-orders/:id — full PO with lines, snapshots
// (metadata), acknowledgement state and margin analysis (internal).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try { vUuid(params.id, 'id') } catch {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('purchase_orders')
    .select(`
      *,
      manufacturer:artisans(id, name, is_active, legal_name, trading_name, order_email, default_currency),
      commercial_order:commercial_orders(id, order_number, source_quote_number, client_snapshot, project_snapshot),
      lines:purchase_order_lines(*),
      snapshots:purchase_order_snapshots(id, revision, document_number, issued_at),
      tokens:purchase_order_ack_tokens(id, revision, expires_at, revoked_at, first_viewed_at, used_at, created_at)
    `)
    .eq('id', params.id).single()
  if (error || !data) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  if (Array.isArray(data.lines)) {
    data.lines.sort((a: { sort_order?: number }, b: { sort_order?: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }

  return NextResponse.json({
    success: true,
    data,
    permissions: {
      canPrepare: cs.permissions.has('purchase_order_prepare'),
      canApprove: cs.permissions.has('purchase_order_approve') || cs.isUltraAdmin,
      isUltraAdmin: cs.isUltraAdmin,
    },
  })
}

// PATCH /api/admin/purchase-orders/:id — draft-only header edits.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')
    const body = await req.json()

    const { data: po } = await supabaseAdmin
      .from('purchase_orders').select('id, locked_at, status, margin_at_risk').eq('id', params.id).single()
    if (!po) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    // Margin resolution and internal notes may be recorded even on issued POs;
    // everything else requires an unlocked draft.
    const resolutionOnly = Object.keys(body).every(k => ['marginResolution', 'marginResolutionNote', 'internalNotes'].includes(k))
    if (po.locked_at && !resolutionOnly) {
      return NextResponse.json({ success: false, error: 'This purchase order is issued and locked. Create a new revision to make changes.' }, { status: 409 })
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.requiredByDate !== undefined) updates.required_by_date = vDate(body.requiredByDate, 'requiredByDate')
    if (body.acknowledgementDueDate !== undefined) updates.acknowledgement_due_date = vDate(body.acknowledgementDueDate, 'acknowledgementDueDate')
    if (body.deliveryAddress !== undefined) updates.delivery_address_snapshot = vString(body.deliveryAddress, 'deliveryAddress', { max: 2000 })
    if (body.paymentTerms !== undefined) updates.payment_terms_snapshot = vString(body.paymentTerms, 'paymentTerms', { max: 2000 })
    if (body.incoterms !== undefined) updates.incoterms_snapshot = vString(body.incoterms, 'incoterms', { max: 100 })
    if (body.supplierNotes !== undefined) updates.supplier_notes = vString(body.supplierNotes, 'supplierNotes', { max: 5000 })
    if (body.internalNotes !== undefined) updates.internal_notes = vString(body.internalNotes, 'internalNotes', { max: 5000 })
    if (body.shippingTotal !== undefined) updates.shipping_total = vNumber(body.shippingTotal, 'shippingTotal', { min: 0 }) ?? 0
    if (body.packagingTotal !== undefined) updates.packaging_total = vNumber(body.packagingTotal, 'packagingTotal', { min: 0 }) ?? 0
    if (body.otherChargesTotal !== undefined) updates.other_charges_total = vNumber(body.otherChargesTotal, 'otherChargesTotal', { min: 0 }) ?? 0
    if (body.otherChargesDescription !== undefined) updates.other_charges_description = vString(body.otherChargesDescription, 'otherChargesDescription', { max: 300 })
    if (body.discountTotal !== undefined) updates.discount_total = vNumber(body.discountTotal, 'discountTotal', { min: 0 }) ?? 0
    if (body.supplierRecipientEmail !== undefined) updates.supplier_recipient_email = vString(body.supplierRecipientEmail, 'supplierRecipientEmail', { max: 300 })
    if (body.ccEmails !== undefined) {
      if (!Array.isArray(body.ccEmails)) throw new ValidationError('ccEmails must be an array')
      updates.cc_emails = body.ccEmails.slice(0, 10).map((e: unknown) => String(e).slice(0, 300))
    }
    if (body.marginResolution !== undefined) {
      updates.margin_resolution = body.marginResolution === null ? null
        : vEnum(body.marginResolution, 'marginResolution', ['accepted_internal_reduction', 'client_variation_required', 'supplier_negotiation_required', 'alternative_supplier_required', 'cancelled'] as const, { required: true })
      const note = vString(body.marginResolutionNote, 'marginResolutionNote', { max: 1000 })
      if (updates.margin_resolution && !note) {
        return NextResponse.json({ success: false, error: 'A resolution note is required when recording a margin-at-risk resolution.' }, { status: 400 })
      }
      updates.margin_resolution_note = note
    } else if (body.marginResolutionNote !== undefined) {
      updates.margin_resolution_note = vString(body.marginResolutionNote, 'marginResolutionNote', { max: 1000 })
    }

    const { error } = await supabaseAdmin.from('purchase_orders').update(updates).eq('id', params.id)
    if (error) return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })

    if (!po.locked_at) await recalcAndPersistPo(params.id)

    await logAudit({
      actor: cs.user, action: 'commercial.po_line_updated', entityType: 'purchase_order', entityId: params.id,
      after: { fields: Object.keys(updates).filter(k => k !== 'updated_at') },
    })
    const { data } = await supabaseAdmin.from('purchase_orders').select('*').eq('id', params.id).single()
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 })
  }
}

// DELETE /api/admin/purchase-orders/:id — drafts only. Issued POs are
// cancelled (Ultra Admin), never deleted.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const { data: po } = await supabaseAdmin
    .from('purchase_orders').select('id, status, locked_at, purchase_order_number, commercial_order_id').eq('id', params.id).single()
  if (!po) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  if (po.locked_at || !['draft', 'pending_approval'].includes(po.status)) {
    // Cancellation path: Ultra Admin with a reason.
    if (!cs.isUltraAdmin) {
      return NextResponse.json({ success: false, error: 'Issued purchase orders can only be cancelled by Ultra Admin.' }, { status: 403 })
    }
    const reason = req.nextUrl.searchParams.get('reason')
    if (!reason) return NextResponse.json({ success: false, error: 'A cancellation reason is required.' }, { status: 400 })
    await supabaseAdmin.from('purchase_orders').update({
      status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: reason.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)
    await supabaseAdmin.from('purchase_order_ack_tokens')
      .update({ revoked_at: new Date().toISOString() }).eq('purchase_order_id', params.id).is('revoked_at', null)
    await supabaseAdmin.from('supplier_allocations')
      .update({ allocation_status: 'allocated', updated_at: new Date().toISOString() })
      .eq('commercial_order_id', po.commercial_order_id).eq('allocation_status', 'included_in_po')
      .in('id', (await supabaseAdmin.from('purchase_order_lines').select('supplier_allocation_id').eq('purchase_order_id', params.id)).data?.map(l => l.supplier_allocation_id).filter(Boolean) ?? [])
    await logAudit({ actor: cs.user, action: 'commercial.po_cancelled', entityType: 'purchase_order', entityId: params.id, after: { reason } })
    return NextResponse.json({ success: true, cancelled: true })
  }

  // Draft delete: release allocations back to 'allocated'.
  const { data: lines } = await supabaseAdmin
    .from('purchase_order_lines').select('supplier_allocation_id').eq('purchase_order_id', params.id)
  const allocIds = (lines ?? []).map(l => l.supplier_allocation_id).filter(Boolean)
  if (allocIds.length > 0) {
    await supabaseAdmin.from('supplier_allocations')
      .update({ allocation_status: 'allocated', updated_at: new Date().toISOString() })
      .in('id', allocIds)
  }
  const { error } = await supabaseAdmin.from('purchase_orders').delete().eq('id', params.id)
  if (error) return NextResponse.json({ success: false, error: 'Delete failed.' }, { status: 500 })

  await logAudit({ actor: cs.user, action: 'commercial.po_cancelled', entityType: 'purchase_order', entityId: params.id, before: { number: po.purchase_order_number, status: 'draft' } })
  return NextResponse.json({ success: true })
}
