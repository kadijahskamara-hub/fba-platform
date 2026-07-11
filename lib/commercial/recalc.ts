import 'server-only'
import { supabaseAdmin } from '../supabase'
import { calculateDocument } from './calculations'
import { getCommercialSettings } from './settings'
import type {
  CalcDocInput, CalcDocResult, CalcLineInput, CommercialSettings,
  ApprovalStatus, DiscountType, LinePricingMethod, LineType, TaxCategory,
} from './types'

// ============================================================
// Server-side recalculation: the ONLY path that persists totals.
// Loads the document and its lines, rebuilds validated inputs,
// runs the shared calculation engine, and writes results back.
// Client-submitted totals are never stored.
// ============================================================

/** UK reduced VAT rate. The standard rate is configurable; reduced-rate
 *  supplies are rare for FBA and use the statutory 5% until settings
 *  grow a dedicated field. */
export const REDUCED_VAT_RATE = 5

export interface ProformaRow {
  id: string
  document_status: string
  approval_status: ApprovalStatus
  pricing_method: 'markup' | 'margin'
  vat_rate: number | string
  deposit_percent: number | string
  deposit_basis: 'gross_total' | 'net_subtotal'
  payments_received: number | string
  procurement_fee_type: string | null
  procurement_fee_basis: string | null
  procurement_fee_value: number | string | null
  procurement_fee_manual_base: number | string | null
  procurement_fee_override: number | string | null
  locked_at: string | null
  [key: string]: unknown
}

export interface LineRow {
  id: string
  line_type: LineType
  quantity: number | string
  supplier_cost_unit: number | string | null
  supplier_cost_source: string
  supplier_cost_overridden: boolean
  pricing_method: LinePricingMethod | null
  pricing_percent: number | string | null
  selling_price_unit: number | string | null
  unit_price: number | string | null
  discount_type: DiscountType | null
  discount_value: number | string | null
  tax_category: TaxCategory
  procurement_fee_eligible: boolean
  sort_order: number
  [key: string]: unknown
}

const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v)

export function buildLineInput(row: LineRow, docPricingMethod: 'markup' | 'margin'): CalcLineInput {
  const cost = row.supplier_cost_source === 'unavailable' ? null : num(row.supplier_cost_unit)
  let method: LinePricingMethod = row.pricing_method ?? (cost !== null ? docPricingMethod : 'manual')
  if (method !== 'manual' && cost === null) method = 'manual'
  return {
    id: row.id,
    lineType: row.line_type ?? 'product',
    quantity: num(row.quantity) ?? 0,
    supplierCostUnit: cost,
    pricingMethod: method,
    pricingPercent: num(row.pricing_percent),
    sellingPriceUnit: num(row.selling_price_unit) ?? num(row.unit_price),
    discountType: row.discount_type,
    discountValue: num(row.discount_value),
    taxCategory: row.tax_category ?? 'standard',
    procurementFeeEligible: Boolean(row.procurement_fee_eligible),
  }
}

export function buildDocInput(pf: ProformaRow, lines: LineRow[], settings: CommercialSettings): CalcDocInput {
  return {
    lines: lines.map(l => buildLineInput(l, pf.pricing_method ?? settings.pricing_method_default)),
    vatRegistered: settings.vat_registered,
    taxRates: { standard: num(pf.vat_rate) ?? settings.default_vat_rate, reduced: REDUCED_VAT_RATE },
    depositPercent: num(pf.deposit_percent) ?? settings.default_deposit_percent,
    depositBasis: pf.deposit_basis ?? 'gross_total',
    procurementFee: {
      type: (pf.procurement_fee_type ?? settings.procurement_fee_type) as CalcDocInput['procurementFee']['type'],
      basis: (pf.procurement_fee_basis ?? settings.procurement_fee_basis) as CalcDocInput['procurementFee']['basis'],
      value: num(pf.procurement_fee_value) ?? settings.procurement_fee_value,
      tiers: settings.procurement_fee_tiers,
      manualBase: num(pf.procurement_fee_manual_base),
      override: num(pf.procurement_fee_override),
    },
    paymentsReceived: num(pf.payments_received) ?? 0,
    thresholds: settings.approval_thresholds,
    supplierCostOverridden: lines.some(l => l.supplier_cost_overridden),
  }
}

function approvalStatusFor(result: CalcDocResult, previous: ApprovalStatus): ApprovalStatus {
  switch (result.approval.level) {
    case 'none': return 'none'
    case 'blocked': return previous === 'approved' ? 'approved' : 'blocked'
    case 'ultra': return previous === 'approved' ? 'approved' : 'required_ultra'
    case 'commercial': return previous === 'approved' ? 'approved' : 'required_commercial'
  }
}

/**
 * Recalculate a document server-side and persist line totals, document
 * totals, and the approval requirement. Refuses to touch issued
 * (locked) documents. Returns the calculation result.
 *
 * `resetApproval` — pass true when commercial inputs changed, so an
 * earlier approval cannot silently cover different numbers.
 */
export async function recalculateAndPersist(
  proformaId: string,
  opts: { resetApproval?: boolean } = {},
): Promise<{ result: CalcDocResult; pf: ProformaRow } | { error: string; status: number }> {
  const { data: pf, error: pfErr } = await supabaseAdmin
    .from('proformas').select('*').eq('id', proformaId).single()
  if (pfErr || !pf) return { error: 'Document not found', status: 404 }
  if (pf.locked_at) return { error: 'This document has been issued and is locked. Create a new revision to make changes.', status: 409 }

  const { data: lines, error: liErr } = await supabaseAdmin
    .from('proforma_line_items').select('*').eq('proforma_id', proformaId)
    .order('sort_order', { ascending: true })
  if (liErr) return { error: liErr.message, status: 500 }

  const settings = await getCommercialSettings()
  const input = buildDocInput(pf as ProformaRow, (lines ?? []) as LineRow[], settings)
  const result = calculateDocument(input)

  // Persist per-line computed values.
  for (const lr of result.lines) {
    if (!lr.id) continue
    await supabaseAdmin.from('proforma_line_items').update({
      selling_price_unit: lr.sellingPriceUnit,
      unit_price: lr.sellingPriceUnit, // legacy column kept in sync
      discount_amount: lr.discountAmount,
      tax_rate_snapshot: lr.taxRate,
      line_cost_total: lr.lineCostTotal,
      line_net_total: lr.lineNetTotal,
      line_tax_total: lr.lineTaxTotal,
      line_gross_total: lr.lineGrossTotal,
    }).eq('id', lr.id)
  }

  const previous: ApprovalStatus = opts.resetApproval ? 'none' : (pf.approval_status as ApprovalStatus)
  const approvalStatus = approvalStatusFor(result, previous)

  await supabaseAdmin.from('proformas').update({
    totals: {
      productCostSubtotal: result.productCostSubtotal,
      productSellingSubtotal: result.productSellingSubtotal,
      serviceSubtotal: result.serviceSubtotal,
      otherChargesSubtotal: result.otherChargesSubtotal,
      discountTotal: result.discountTotal,
      procurementFeeBasisAmount: result.procurementFeeBasisAmount,
      procurementFee: result.procurementFee,
      netSubtotal: result.netSubtotal,
      vatByCategory: result.vatByCategory,
      vatTotal: result.vatTotal,
      grossTotal: result.grossTotal,
      depositRequested: result.depositRequested,
      paymentsReceived: result.paymentsReceived,
      balanceDue: result.balanceDue,
      effectiveMarkupPercent: result.effectiveMarkupPercent,
      effectiveMarginPercent: result.effectiveMarginPercent,
      costIncomplete: result.costIncomplete,
      approvalReasons: result.approval.reasons,
      calculatedAt: new Date().toISOString(),
    },
    approval_status: approvalStatus,
    approval_reason: result.approval.reasons.join(' ') || null,
    updated_at: new Date().toISOString(),
  }).eq('id', proformaId)

  return { result, pf: { ...(pf as ProformaRow), approval_status: approvalStatus } }
}
