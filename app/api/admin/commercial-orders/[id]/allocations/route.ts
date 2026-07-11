import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { assessAllocationReadiness, lineEligibleForProcurement } from '@/lib/commercial/poCalculations'
import { logAudit } from '@/lib/audit'
import { ValidationError, vUuid, vUuidOrNull, vString, vNumber, vDate, vEnum } from '@/lib/commercial/validation'

// POST /api/admin/commercial-orders/:id/allocations — allocate a source
// line to a manufacturer with a real supplier cost. Costs are never
// derived from selling prices and never fabricated.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')
    const body = await req.json()
    const sourceLineItemId = vUuid(body.sourceLineItemId, 'sourceLineItemId')
    const manufacturerId = vUuid(body.manufacturerId, 'manufacturerId')

    const { data: order } = await supabaseAdmin
      .from('commercial_orders').select('id, status, source_proforma_id, project_snapshot').eq('id', params.id).single()
    if (!order) return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
    if (['cancelled', 'completed'].includes(order.status)) {
      return NextResponse.json({ success: false, error: `This order is ${order.status}.` }, { status: 409 })
    }

    const { data: line } = await supabaseAdmin
      .from('proforma_line_items').select('*').eq('id', sourceLineItemId).eq('proforma_id', order.source_proforma_id).single()
    if (!line) return NextResponse.json({ success: false, error: 'Source line not found on this order.' }, { status: 404 })
    if (!lineEligibleForProcurement(line.line_type)) {
      return NextResponse.json({ success: false, error: `${line.line_type} lines are not procured from manufacturers.` }, { status: 400 })
    }

    const { data: manufacturer } = await supabaseAdmin
      .from('artisans').select('id, name, is_active, default_currency, default_lead_time').eq('id', manufacturerId).single()
    if (!manufacturer) return NextResponse.json({ success: false, error: 'Manufacturer not found' }, { status: 404 })

    // Existing active allocations for this line (split support: sum must not exceed source qty).
    const { data: existing } = await supabaseAdmin
      .from('supplier_allocations').select('quantity')
      .eq('source_line_item_id', sourceLineItemId)
      .not('allocation_status', 'in', '(cancelled,superseded)')
    const otherQty = (existing ?? []).reduce((s, a) => s + Number(a.quantity), 0)

    const quantity = vNumber(body.quantity, 'quantity', { min: 0.001 }) ?? Number(line.quantity)
    // Supplier cost: explicit input, or the line's real cost — never the selling price.
    const supplierCostUnit = body.supplierCostUnit !== undefined
      ? vNumber(body.supplierCostUnit, 'supplierCostUnit', { min: 0 })
      : (line.supplier_cost_source === 'unavailable' ? null : (line.supplier_cost_unit == null ? null : Number(line.supplier_cost_unit)))
    const supplierCurrency = vString(body.supplierCurrency, 'supplierCurrency', { max: 3 })
      ?? manufacturer.default_currency ?? null

    const readiness = assessAllocationReadiness({
      manufacturerId, supplierCostUnit, supplierCurrency,
      quantity, sourceQuantity: Number(line.quantity), otherAllocatedQuantity: otherQty,
    })
    // Quantity over-allocation is a hard block; missing cost/currency may be
    // saved as a draft allocation but stays not-ready for PO generation.
    const overAlloc = readiness.problems.find(p => p.includes('exceeds the client-order quantity'))
    if (overAlloc) return NextResponse.json({ success: false, error: overAlloc }, { status: 400 })

    const { data: alloc, error } = await supabaseAdmin.from('supplier_allocations').insert({
      commercial_order_id: params.id,
      source_line_item_id: sourceLineItemId,
      manufacturer_id: manufacturerId,
      supplier_product_id: vUuidOrNull(body.supplierProductId, 'supplierProductId') ?? line.product_id ?? null,
      supplier_sku: vString(body.supplierSku, 'supplierSku', { max: 120 }) ?? line.supplier_sku ?? null,
      quantity,
      unit_of_measure: line.unit_of_measure ?? 'each',
      supplier_currency: supplierCurrency,
      supplier_cost_unit: supplierCostUnit,
      supplier_cost_total: supplierCostUnit == null ? null : Math.round(supplierCostUnit * quantity * 100) / 100,
      required_by_date: vDate(body.requiredByDate, 'requiredByDate'),
      delivery_destination_type: vEnum(body.deliveryDestinationType, 'deliveryDestinationType', ['client_site', 'fba_studio', 'warehouse', 'other'] as const) ?? 'client_site',
      delivery_address_snapshot: vString(body.deliveryAddress, 'deliveryAddress', { max: 2000 })
        ?? ((order.project_snapshot as Record<string, unknown> | null)?.delivery_address as string) ?? null,
      specification_snapshot: {
        name: line.name, description: line.description, spec_details: line.spec_details,
        selected_finish: line.selected_finish, selected_fabric: line.selected_fabric,
        selected_size: line.selected_size, image_url: line.image_url,
      },
      allocation_status: 'allocated',
      created_by: cs.user.id,
    }).select().single()
    if (error) return NextResponse.json({ success: false, error: 'Allocation failed.' }, { status: 500 })

    // Keep the line's manufacturer assignment in step when it was missing.
    if (!line.manufacturer_id) {
      await supabaseAdmin.from('proforma_line_items').update({ manufacturer_id: manufacturerId }).eq('id', line.id)
    }

    await logAudit({
      actor: cs.user, action: 'commercial.allocation_created', entityType: 'supplier_allocation', entityId: alloc.id,
      after: { orderId: params.id, line: line.name, manufacturer: manufacturer.name, quantity, ready: readiness.ready },
    })
    return NextResponse.json({ success: true, data: alloc, readiness })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 })
  }
}
