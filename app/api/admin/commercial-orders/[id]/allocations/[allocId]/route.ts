import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { logAudit } from '@/lib/audit'
import { ValidationError, vUuid, vString, vNumber, vDate, vEnum } from '@/lib/commercial/validation'

async function loadAllocation(orderId: string, allocId: string) {
  const { data } = await supabaseAdmin
    .from('supplier_allocations')
    .select('*, source_line:proforma_line_items(quantity, name)')
    .eq('id', allocId).eq('commercial_order_id', orderId).single()
  return data
}

// PATCH /api/admin/commercial-orders/:id/allocations/:allocId
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; allocId: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id'); vUuid(params.allocId, 'allocId')
    const body = await req.json()
    const alloc = await loadAllocation(params.id, params.allocId)
    if (!alloc) return NextResponse.json({ success: false, error: 'Allocation not found' }, { status: 404 })
    if (alloc.allocation_status === 'included_in_po') {
      return NextResponse.json({ success: false, error: 'This allocation is already included in a purchase order. Revise the PO instead.' }, { status: 409 })
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.manufacturerId !== undefined) updates.manufacturer_id = vUuid(body.manufacturerId, 'manufacturerId')
    if (body.quantity !== undefined) {
      const qty = vNumber(body.quantity, 'quantity', { min: 0.001, required: true })!
      // Enforce the client-order quantity ceiling across active allocations.
      const { data: others } = await supabaseAdmin
        .from('supplier_allocations').select('quantity')
        .eq('source_line_item_id', alloc.source_line_item_id)
        .neq('id', params.allocId)
        .not('allocation_status', 'in', '(cancelled,superseded)')
      const otherQty = (others ?? []).reduce((s, a) => s + Number(a.quantity), 0)
      const sourceQty = Number((alloc.source_line as Record<string, unknown>)?.quantity ?? 0)
      if (qty + otherQty > sourceQty + 1e-9) {
        return NextResponse.json({ success: false, error: `Allocated quantity (${qty + otherQty}) exceeds the client-order quantity (${sourceQty}).` }, { status: 400 })
      }
      updates.quantity = qty
    }
    if (body.supplierCostUnit !== undefined) {
      updates.supplier_cost_unit = body.supplierCostUnit === null ? null : vNumber(body.supplierCostUnit, 'supplierCostUnit', { min: 0 })
    }
    if (body.supplierCurrency !== undefined) updates.supplier_currency = vString(body.supplierCurrency, 'supplierCurrency', { max: 3 })
    if (body.supplierSku !== undefined) updates.supplier_sku = vString(body.supplierSku, 'supplierSku', { max: 120 })
    if (body.requiredByDate !== undefined) updates.required_by_date = vDate(body.requiredByDate, 'requiredByDate')
    if (body.deliveryDestinationType !== undefined) updates.delivery_destination_type = vEnum(body.deliveryDestinationType, 'deliveryDestinationType', ['client_site', 'fba_studio', 'warehouse', 'other'] as const, { required: true })
    if (body.deliveryAddress !== undefined) updates.delivery_address_snapshot = vString(body.deliveryAddress, 'deliveryAddress', { max: 2000 })
    if (body.allocationStatus !== undefined) {
      updates.allocation_status = vEnum(body.allocationStatus, 'allocationStatus', ['allocated', 'ready_for_po', 'cancelled'] as const, { required: true })
    }

    // Keep cost total in step.
    const newQty = (updates.quantity as number | undefined) ?? Number(alloc.quantity)
    const newCost = updates.supplier_cost_unit !== undefined
      ? (updates.supplier_cost_unit as number | null)
      : (alloc.supplier_cost_unit == null ? null : Number(alloc.supplier_cost_unit))
    updates.supplier_cost_total = newCost == null ? null : Math.round(newCost * newQty * 100) / 100

    const { data, error } = await supabaseAdmin
      .from('supplier_allocations').update(updates).eq('id', params.allocId).select().single()
    if (error) return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })

    await logAudit({
      actor: cs.user, action: 'commercial.allocation_updated', entityType: 'supplier_allocation', entityId: params.allocId,
      before: { quantity: alloc.quantity, cost: alloc.supplier_cost_unit },
      after: { fields: Object.keys(updates).filter(k => k !== 'updated_at') },
    })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 })
  }
}

// DELETE /api/admin/commercial-orders/:id/allocations/:allocId
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; allocId: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const alloc = await loadAllocation(params.id, params.allocId)
  if (!alloc) return NextResponse.json({ success: false, error: 'Allocation not found' }, { status: 404 })
  if (alloc.allocation_status === 'included_in_po') {
    return NextResponse.json({ success: false, error: 'This allocation is included in a purchase order. Revise or cancel the PO first.' }, { status: 409 })
  }

  const { error } = await supabaseAdmin.from('supplier_allocations').delete().eq('id', params.allocId)
  if (error) return NextResponse.json({ success: false, error: 'Delete failed.' }, { status: 500 })

  await logAudit({
    actor: cs.user, action: 'commercial.allocation_removed', entityType: 'supplier_allocation', entityId: params.allocId,
    before: { line: (alloc.source_line as Record<string, unknown>)?.name, manufacturer: alloc.manufacturer_id },
  })
  return NextResponse.json({ success: true })
}
