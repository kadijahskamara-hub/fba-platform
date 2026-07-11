import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { recalculateAndPersist } from '@/lib/commercial/recalc'
import { logAudit } from '@/lib/audit'
import {
  ValidationError, vUuid, vUuidOrNull, vString, vNumber, vEnum, vBoolean,
} from '@/lib/commercial/validation'
import { TAX_CATEGORIES } from '@/lib/commercial/types'

const PRICE_FIELDS = ['supplierCostUnit', 'supplierCostOverrideReason', 'pricingMethod', 'pricingPercent', 'sellingPriceUnit'] as const
const DISCOUNT_FIELDS = ['discountType', 'discountValue'] as const

async function guard(params: { id: string; itemId: string }) {
  const { data: pf } = await supabaseAdmin
    .from('proformas').select('id, locked_at').eq('id', params.id).single()
  if (!pf) return { error: 'Not found', status: 404 }
  if (pf.locked_at) return { error: 'This document has been issued and is locked. Create a new revision to make changes.', status: 409 }
  return null
}

// PATCH /api/admin/proformas/:id/items/:itemId — edit a line item.
export async function PATCH(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const cs = await requireCommercial('quote_edit')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    vUuid(params.id, 'id'); vUuid(params.itemId, 'itemId')
    body = await req.json()
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof ValidationError ? e.message : 'Invalid request' }, { status: 400 })
  }

  const locked = await guard(params)
  if (locked) return NextResponse.json({ success: false, error: locked.error }, { status: locked.status })

  if (PRICE_FIELDS.some(f => body[f] !== undefined) && !cs.permissions.has('quote_price_edit')) {
    return NextResponse.json({ success: false, error: 'You do not have permission to change prices on quote lines.' }, { status: 403 })
  }
  if (DISCOUNT_FIELDS.some(f => body[f] !== undefined) && !cs.permissions.has('quote_discount_override')) {
    return NextResponse.json({ success: false, error: 'You do not have permission to apply discounts.' }, { status: 403 })
  }

  const { data: before } = await supabaseAdmin
    .from('proforma_line_items').select('*').eq('id', params.itemId).eq('proforma_id', params.id).single()
  if (!before) return NextResponse.json({ success: false, error: 'Line not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  let commercialChange = false
  try {
    if (body.name !== undefined) updates.name = vString(body.name, 'name', { required: true, max: 300 })
    if (body.description !== undefined) updates.description = vString(body.description, 'description', { max: 5000 })
    if (body.quantity !== undefined) { updates.quantity = vNumber(body.quantity, 'quantity', { min: 0.001, max: 100000, required: true }); commercialChange = true }
    if (body.unitOfMeasure !== undefined) updates.unit_of_measure = vString(body.unitOfMeasure, 'unitOfMeasure', { max: 40 }) ?? 'each'
    if (body.manufacturerId !== undefined) updates.manufacturer_id = vUuidOrNull(body.manufacturerId, 'manufacturerId')
    if (body.manufacturerName !== undefined) updates.manufacturer_name = vString(body.manufacturerName, 'manufacturerName', { max: 300 })
    if (body.supplierSku !== undefined) updates.supplier_sku = vString(body.supplierSku, 'supplierSku', { max: 120 })
    if (body.selectedFinish !== undefined) updates.selected_finish = vString(body.selectedFinish, 'selectedFinish', { max: 500 })
    if (body.selectedFabric !== undefined) updates.selected_fabric = vString(body.selectedFabric, 'selectedFabric', { max: 500 })
    if (body.selectedSize !== undefined) updates.selected_size = vString(body.selectedSize, 'selectedSize', { max: 500 })
    if (body.notes !== undefined) updates.notes = vString(body.notes, 'notes', { max: 2000 })
    if (body.internalNotes !== undefined) updates.internal_notes = vString(body.internalNotes, 'internalNotes', { max: 2000 })
    if (body.section !== undefined) updates.section = vString(body.section, 'section', { max: 200 })
    if (body.specDetails !== undefined) updates.spec_details = vString(body.specDetails, 'specDetails', { max: 5000 })
    if (body.imageUrl !== undefined) updates.image_url = vString(body.imageUrl, 'imageUrl', { max: 1000 })
    if (body.sortOrder !== undefined) updates.sort_order = vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 })
    if (body.taxCategory !== undefined) { updates.tax_category = vEnum(body.taxCategory, 'taxCategory', TAX_CATEGORIES, { required: true }); commercialChange = true }
    if (body.procurementFeeEligible !== undefined) { updates.procurement_fee_eligible = vBoolean(body.procurementFeeEligible, 'procurementFeeEligible', true); commercialChange = true }

    // ── Cost ──
    if (body.supplierCostUnit !== undefined) {
      const v = body.supplierCostUnit === null ? null : vNumber(body.supplierCostUnit, 'supplierCostUnit', { min: 0 })
      updates.supplier_cost_unit = v
      updates.supplier_cost_source = v === null ? 'unavailable' : 'manual'
      // Changing a cost that came from a catalogue source is an override
      // and needs a reason (Commercial Admin approval is then required
      // by the calculation engine).
      const wasCatalogue = String(before.supplier_cost_source).startsWith('catalogue')
      const isChange = v !== null && before.supplier_cost_unit !== null && Number(before.supplier_cost_unit) !== v
      if (wasCatalogue && isChange) {
        const reason = vString(body.supplierCostOverrideReason, 'supplierCostOverrideReason', { max: 500 })
        if (!reason) return NextResponse.json({ success: false, error: 'A reason is required to override a catalogue supplier cost.' }, { status: 400 })
        updates.supplier_cost_overridden = true
        updates.supplier_cost_override_reason = reason
      }
      commercialChange = true
    }

    // ── Pricing method / percent / manual selling price ──
    if (body.pricingMethod !== undefined) { updates.pricing_method = vEnum(body.pricingMethod, 'pricingMethod', ['markup', 'margin', 'manual'] as const); commercialChange = true }
    if (body.pricingPercent !== undefined) { updates.pricing_percent = body.pricingPercent === null ? null : vNumber(body.pricingPercent, 'pricingPercent', { min: -1000, max: 1000 }); commercialChange = true }
    if (body.sellingPriceUnit !== undefined) {
      updates.selling_price_unit = body.sellingPriceUnit === null ? null : vNumber(body.sellingPriceUnit, 'sellingPriceUnit', { min: 0 })
      updates.unit_price = updates.selling_price_unit
      commercialChange = true
    }

    // ── Discounts ──
    if (body.discountType !== undefined) { updates.discount_type = body.discountType === null ? null : vEnum(body.discountType, 'discountType', ['percent', 'fixed'] as const); commercialChange = true }
    if (body.discountValue !== undefined) { updates.discount_value = body.discountValue === null ? null : vNumber(body.discountValue, 'discountValue', { min: 0 }); commercialChange = true }
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    throw e
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('proforma_line_items').update(updates).eq('id', params.itemId).eq('proforma_id', params.id).select().single()
  if (error) return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })

  const recalc = await recalculateAndPersist(params.id, { resetApproval: commercialChange })
  if ('error' in recalc) return NextResponse.json({ success: false, error: recalc.error }, { status: recalc.status })

  const auditAction = updates.supplier_cost_overridden
    ? 'commercial.cost_overridden'
    : (body.discountType !== undefined || body.discountValue !== undefined)
      ? 'commercial.discount_overridden'
      : 'commercial.line_updated'
  await logAudit({
    actor: cs.user, action: auditAction, entityType: 'proforma_line_item', entityId: params.itemId,
    before: { quantity: before.quantity, selling_price_unit: before.selling_price_unit, supplier_cost_unit: before.supplier_cost_unit },
    after: { fields: Object.keys(updates) },
  })

  return NextResponse.json({ success: true, data })
}

// DELETE /api/admin/proformas/:id/items/:itemId
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const cs = await requireCommercial('quote_edit')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const locked = await guard(params)
  if (locked) return NextResponse.json({ success: false, error: locked.error }, { status: locked.status })

  const { error } = await supabaseAdmin
    .from('proforma_line_items').delete().eq('id', params.itemId).eq('proforma_id', params.id)
  if (error) return NextResponse.json({ success: false, error: 'Delete failed.' }, { status: 500 })

  await recalculateAndPersist(params.id, { resetApproval: true })
  await logAudit({ actor: cs.user, action: 'commercial.line_deleted', entityType: 'proforma_line_item', entityId: params.itemId, after: { proformaId: params.id } })
  return NextResponse.json({ success: true })
}
