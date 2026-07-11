import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { recalcAndPersistPo } from '@/lib/commercial/purchaseOrders'
import { SUPPLIER_TAX_CATEGORIES } from '@/lib/commercial/poCalculations'
import { logAudit } from '@/lib/audit'
import { ValidationError, vUuid, vString, vNumber, vDate, vEnum } from '@/lib/commercial/validation'

async function guard(poId: string) {
  const { data: po } = await supabaseAdmin
    .from('purchase_orders').select('id, locked_at').eq('id', poId).single()
  if (!po) return { error: 'Purchase order not found', status: 404 }
  if (po.locked_at) return { error: 'This purchase order is issued and locked. Create a new revision to make changes.', status: 409 }
  return null
}

// PATCH /api/admin/purchase-orders/:id/lines/:lineId
export async function PATCH(req: NextRequest, { params }: { params: { id: string; lineId: string } }) {
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id'); vUuid(params.lineId, 'lineId')
    const body = await req.json()
    const locked = await guard(params.id)
    if (locked) return NextResponse.json({ success: false, error: locked.error }, { status: locked.status })

    const { data: before } = await supabaseAdmin
      .from('purchase_order_lines')
      .select('*, allocation:supplier_allocations(supplier_cost_unit, quantity)')
      .eq('id', params.lineId).eq('purchase_order_id', params.id).single()
    if (!before) return NextResponse.json({ success: false, error: 'Line not found' }, { status: 404 })

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    let costOverride = false

    if (body.quantity !== undefined) updates.quantity = vNumber(body.quantity, 'quantity', { min: 0.001, required: true })
    if (body.unitOfMeasure !== undefined) updates.unit_of_measure = vString(body.unitOfMeasure, 'unitOfMeasure', { max: 40 }) ?? 'each'
    if (body.supplierSku !== undefined) updates.supplier_sku = vString(body.supplierSku, 'supplierSku', { max: 120 })
    if (body.supplierCostUnit !== undefined) {
      const v = vNumber(body.supplierCostUnit, 'supplierCostUnit', { min: 0, required: true })!
      const allocCost = (before.allocation as Record<string, unknown> | null)?.supplier_cost_unit
      if (allocCost != null && Number(allocCost) !== v) {
        // Protected supplier cost: changing it away from the allocation
        // requires a recorded reason (and triggers approval).
        const reason = vString(body.costOverrideReason, 'costOverrideReason', { max: 500 })
        if (!reason) return NextResponse.json({ success: false, error: 'A reason is required to change the supplier cost away from the allocation.' }, { status: 400 })
        updates.cost_overridden = true
        updates.cost_override_reason = reason
        costOverride = true
      }
      updates.supplier_cost_unit = v
    }
    if (body.discountAmount !== undefined) updates.discount_amount = vNumber(body.discountAmount, 'discountAmount', { min: 0 }) ?? 0
    if (body.taxCategory !== undefined) {
      updates.tax_category = vEnum(body.taxCategory, 'taxCategory', SUPPLIER_TAX_CATEGORIES, { required: true })
    }
    if (body.taxRate !== undefined) updates.tax_rate_snapshot = body.taxRate === null ? null : vNumber(body.taxRate, 'taxRate', { min: 0, max: 100 })
    if (body.requiredByDate !== undefined) updates.required_by_date = vDate(body.requiredByDate, 'requiredByDate')
    if (body.supplierNotes !== undefined) updates.supplier_notes = vString(body.supplierNotes, 'supplierNotes', { max: 2000 })
    if (body.internalNotes !== undefined) updates.internal_notes = vString(body.internalNotes, 'internalNotes', { max: 2000 })
    if (body.sortOrder !== undefined) updates.sort_order = vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 })

    const { data, error } = await supabaseAdmin
      .from('purchase_order_lines').update(updates)
      .eq('id', params.lineId).eq('purchase_order_id', params.id).select().single()
    if (error) return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })

    await recalcAndPersistPo(params.id)

    await logAudit({
      actor: cs.user,
      action: costOverride ? 'commercial.po_cost_overridden' : 'commercial.po_line_updated',
      entityType: 'purchase_order_line', entityId: params.lineId,
      before: { quantity: before.quantity, supplier_cost_unit: before.supplier_cost_unit },
      after: { fields: Object.keys(updates).filter(k => k !== 'updated_at') },
    })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 })
  }
}

// DELETE /api/admin/purchase-orders/:id/lines/:lineId — releases the allocation.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; lineId: string } }) {
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const locked = await guard(params.id)
  if (locked) return NextResponse.json({ success: false, error: locked.error }, { status: locked.status })

  const { data: line } = await supabaseAdmin
    .from('purchase_order_lines').select('id, supplier_allocation_id, product_name_snapshot')
    .eq('id', params.lineId).eq('purchase_order_id', params.id).single()
  if (!line) return NextResponse.json({ success: false, error: 'Line not found' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('purchase_order_lines').delete().eq('id', params.lineId)
  if (error) return NextResponse.json({ success: false, error: 'Delete failed.' }, { status: 500 })

  if (line.supplier_allocation_id) {
    await supabaseAdmin.from('supplier_allocations')
      .update({ allocation_status: 'allocated', updated_at: new Date().toISOString() })
      .eq('id', line.supplier_allocation_id)
  }
  await recalcAndPersistPo(params.id)

  await logAudit({
    actor: cs.user, action: 'commercial.po_line_removed', entityType: 'purchase_order_line', entityId: params.lineId,
    before: { name: line.product_name_snapshot },
  })
  return NextResponse.json({ success: true })
}
