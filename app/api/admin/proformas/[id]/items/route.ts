import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { recalculateAndPersist } from '@/lib/commercial/recalc'
import { logAudit } from '@/lib/audit'
import {
  ValidationError, vUuid, vUuidOrNull, vString, vNumber, vPercent, vEnum, vBoolean,
} from '@/lib/commercial/validation'
import { LINE_TYPES, TAX_CATEGORIES } from '@/lib/commercial/types'

// POST /api/admin/proformas/:id/items — add a line item.
// Supports: catalogue product, bespoke product, catalogue service,
// off-catalogue service, and fee/delivery/installation/adjustment lines.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('quote_edit')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    vUuid(params.id, 'id')
    body = await req.json()
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof ValidationError ? e.message : 'Invalid request' }, { status: 400 })
  }

  const { data: pf } = await supabaseAdmin
    .from('proformas').select('id, locked_at, currency, default_tax_category, pricing_method').eq('id', params.id).single()
  if (!pf) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  if (pf.locked_at) return NextResponse.json({ success: false, error: 'This document has been issued and is locked. Create a new revision to make changes.', }, { status: 409 })

  // Pricing fields need pricing rights; plain adds fall back to catalogue defaults.
  const touchesPricing = ['supplierCostUnit', 'pricingMethod', 'pricingPercent', 'sellingPriceUnit', 'discountType', 'discountValue']
    .some(f => body[f] !== undefined)
  if (touchesPricing && !cs.permissions.has('quote_price_edit')) {
    return NextResponse.json({ success: false, error: 'You do not have permission to set prices on quote lines.' }, { status: 403 })
  }
  if ((body.discountType !== undefined || body.discountValue !== undefined) && !cs.permissions.has('quote_discount_override')) {
    return NextResponse.json({ success: false, error: 'You do not have permission to apply discounts.' }, { status: 403 })
  }

  const { data: existing } = await supabaseAdmin
    .from('proforma_line_items').select('sort_order').eq('proforma_id', params.id)
    .order('sort_order', { ascending: false }).limit(1)
  const nextSort = ((existing?.[0]?.sort_order as number) ?? -1) + 1

  let row: Record<string, unknown>
  try {
    const lineType = vEnum(body.lineType, 'lineType', LINE_TYPES) ?? (body.serviceCatalogueId || body.serviceName ? 'service' : 'product')
    const supplierCostUnit = vNumber(body.supplierCostUnit, 'supplierCostUnit', { min: 0 })
    row = {
      proforma_id: params.id,
      line_type: lineType,
      quantity: vNumber(body.quantity, 'quantity', { min: 0.001, max: 100000 }) ?? 1,
      unit_of_measure: vString(body.unitOfMeasure, 'unitOfMeasure', { max: 40 }) ?? 'each',
      currency: pf.currency ?? 'GBP',
      selected_finish: vString(body.selectedFinish, 'selectedFinish', { max: 500 }),
      selected_fabric: vString(body.selectedFabric, 'selectedFabric', { max: 500 }),
      selected_size: vString(body.selectedSize, 'selectedSize', { max: 500 }),
      notes: vString(body.notes, 'notes', { max: 2000 }),
      internal_notes: vString(body.internalNotes, 'internalNotes', { max: 2000 }),
      section: vString(body.section, 'section', { max: 200 }),
      spec_details: vString(body.specDetails, 'specDetails', { max: 5000 }),
      image_url: vString(body.imageUrl, 'imageUrl', { max: 1000 }),
      sort_order: nextSort,
      tax_category: vEnum(body.taxCategory, 'taxCategory', TAX_CATEGORIES) ?? pf.default_tax_category ?? 'standard',
      supplier_cost_unit: supplierCostUnit,
      supplier_cost_source: supplierCostUnit != null ? 'manual' : 'unavailable',
      supplier_cost_overridden: false,
      pricing_method: vEnum(body.pricingMethod, 'pricingMethod', ['markup', 'margin', 'manual'] as const),
      pricing_percent: vNumber(body.pricingPercent, 'pricingPercent', { min: -1000, max: 1000 }),
      selling_price_unit: vNumber(body.sellingPriceUnit, 'sellingPriceUnit', { min: 0 }),
      discount_type: vEnum(body.discountType, 'discountType', ['percent', 'fixed'] as const),
      discount_value: vNumber(body.discountValue, 'discountValue', { min: 0 }),
      procurement_fee_eligible: vBoolean(body.procurementFeeEligible, 'procurementFeeEligible', true),
    }

    if (lineType === 'product' && body.productId) {
      // Catalogue product: snapshot name/image/SKU, seed the SELLING price
      // from the catalogue trade price (never treated as supplier cost).
      const productId = vUuid(body.productId, 'productId')
      const { data: product } = await supabaseAdmin
        .from('products').select('name, trade_price, artisan_id, images, sku').eq('id', productId).single()
      if (!product) return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 })
      row.product_id = productId
      row.is_bespoke = false
      row.name = vString(body.name, 'name', { max: 300 }) ?? product.name ?? 'Item'
      row.fba_sku = product.sku ?? null
      row.manufacturer_id = vUuidOrNull(body.manufacturerId, 'manufacturerId') ?? product.artisan_id ?? null
      if (row.selling_price_unit == null) {
        row.selling_price_unit = product.trade_price ?? null
        row.pricing_method = row.pricing_method ?? 'manual'
      }
      row.image_url = row.image_url ?? (product.images as string[] | null)?.[0] ?? null
    } else if (lineType === 'service') {
      // Catalogue or off-catalogue service line.
      const serviceId = vUuidOrNull(body.serviceCatalogueId, 'serviceCatalogueId')
      if (serviceId) {
        const { data: svc } = await supabaseAdmin
          .from('service_catalogue').select('*').eq('id', serviceId).single()
        if (!svc) return NextResponse.json({ success: false, error: 'Service not found' }, { status: 404 })
        row.service_catalogue_id = serviceId
        row.name = vString(body.name, 'name', { max: 300 }) ?? svc.name
        row.description = vString(body.description, 'description', { max: 5000 }) ?? svc.description
        row.unit_of_measure = vString(body.unitOfMeasure, 'unitOfMeasure', { max: 40 }) ?? svc.default_unit ?? 'each'
        row.tax_category = vEnum(body.taxCategory, 'taxCategory', TAX_CATEGORIES) ?? svc.default_tax_category
        if (row.selling_price_unit == null && svc.default_rate != null) {
          row.selling_price_unit = svc.default_rate
          row.pricing_method = row.pricing_method ?? 'manual'
        }
      } else {
        const name = vString(body.name ?? body.serviceName, 'name', { required: true, max: 300 })
        row.name = name
        row.description = vString(body.description, 'description', { max: 5000 })
      }
      row.is_bespoke = false
      row.product_id = null
      row.pricing_method = row.pricing_method ?? 'manual'
    } else {
      // Bespoke product or other charge lines: manual entry.
      const name = vString(body.name, 'name', { required: true, max: 300 })
      row.name = name
      row.description = vString(body.description, 'description', { max: 5000 })
      row.is_bespoke = lineType === 'product'
      row.product_id = null
      row.manufacturer_id = vUuidOrNull(body.manufacturerId, 'manufacturerId')
      row.manufacturer_name = vString(body.manufacturerName, 'manufacturerName', { max: 300 })
      row.supplier_sku = vString(body.supplierSku, 'supplierSku', { max: 120 })
      row.pricing_method = row.pricing_method ?? (row.supplier_cost_unit != null ? null : 'manual')
    }

    // Keep the legacy column aligned where a manual selling price exists.
    if (row.selling_price_unit != null) row.unit_price = row.selling_price_unit
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    throw e
  }

  const { data, error } = await supabaseAdmin.from('proforma_line_items').insert(row).select().single()
  if (error) return NextResponse.json({ success: false, error: 'Insert failed.' }, { status: 500 })

  await recalculateAndPersist(params.id, { resetApproval: true })
  await logAudit({
    actor: cs.user, action: 'commercial.line_added', entityType: 'proforma_line_item', entityId: data.id,
    after: { proformaId: params.id, lineType: row.line_type, name: row.name },
  })
  return NextResponse.json({ success: true, data })
}
