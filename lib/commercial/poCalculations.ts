// ============================================================
// Supplier-side purchase-order calculation engine (Sprint 2).
//
// Pure module (no server imports) reusing the Sprint 1 minor-unit
// money utilities. This is deliberately SEPARATE from the client
// calculation engine: purchase orders work in supplier costs and
// supplier tax treatment, and must never include FBA margin,
// client VAT treatment, client fees, deposits or discounts.
// ============================================================

import { toMinor, fromMinor, roundHalfUp } from './calculations'
import type { LineType } from './types'

export type SupplierTaxCategory =
  | 'standard' | 'reduced' | 'zero' | 'exempt' | 'outside_scope' | 'reverse_charge' | 'unknown'

export const SUPPLIER_TAX_CATEGORIES: SupplierTaxCategory[] =
  ['standard', 'reduced', 'zero', 'exempt', 'outside_scope', 'reverse_charge', 'unknown']

/** Line types eligible for manufacturer procurement (spec §5). */
export const PROCUREMENT_ELIGIBLE_LINE_TYPES: LineType[] = ['product', 'delivery', 'installation']

export function lineEligibleForProcurement(lineType: string): boolean {
  return (PROCUREMENT_ELIGIBLE_LINE_TYPES as string[]).includes(lineType)
}

// ── Allocation readiness ─────────────────────────────────────

export interface AllocationReadinessInput {
  manufacturerId: string | null
  supplierCostUnit: number | null
  supplierCurrency: string | null
  quantity: number
  /** Client-order quantity for the source line (allocation may not exceed it). */
  sourceQuantity: number
  /** Total quantity already allocated for this source line elsewhere. */
  otherAllocatedQuantity?: number
}

export interface AllocationReadiness {
  ready: boolean
  problems: string[]
}

export function assessAllocationReadiness(a: AllocationReadinessInput): AllocationReadiness {
  const problems: string[] = []
  if (!a.manufacturerId) problems.push('No manufacturer assigned.')
  if (a.supplierCostUnit === null || a.supplierCostUnit === undefined) problems.push('Supplier cost unavailable — enter the cost or exclude the line from procurement.')
  if (a.supplierCostUnit !== null && a.supplierCostUnit !== undefined && a.supplierCostUnit < 0) problems.push('Supplier cost cannot be negative.')
  if (!a.supplierCurrency) problems.push('Supplier currency unknown.')
  if (!(a.quantity > 0)) problems.push('Quantity must be greater than zero.')
  const already = a.otherAllocatedQuantity ?? 0
  if (a.quantity + already > a.sourceQuantity + 1e-9) {
    problems.push(`Allocated quantity (${a.quantity + already}) exceeds the client-order quantity (${a.sourceQuantity}).`)
  }
  return { ready: problems.length === 0, problems }
}

// ── PO line calculation ──────────────────────────────────────

export interface CalcPoLineInput {
  id?: string
  quantity: number
  supplierCostUnit: number      // major units
  discountAmount: number        // major units, absolute per line
  taxCategory: SupplierTaxCategory
  /** Rate for standard/reduced categories. Zero/exempt/outside_scope/reverse_charge = 0. */
  taxRate: number | null
}

export interface CalcPoLineResult {
  id?: string
  quantity: number
  supplierCostUnit: number
  lineSubtotal: number
  discountAmount: number
  lineNetTotal: number
  taxCategory: SupplierTaxCategory
  taxRate: number
  lineTaxTotal: number
  lineGrossTotal: number
  unknownTax: boolean
}

function supplierTaxRateFor(category: SupplierTaxCategory, rate: number | null): number {
  switch (category) {
    case 'standard':
    case 'reduced':
      return rate ?? 0
    default:
      return 0 // zero / exempt / outside_scope / reverse_charge / unknown
  }
}

export function calculatePoLine(input: CalcPoLineInput): CalcPoLineResult {
  const qty = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 0
  const costMinor = toMinor(input.supplierCostUnit)
  const subtotalMinor = roundHalfUp(costMinor * qty)
  const discountMinor = Math.min(Math.max(toMinor(input.discountAmount ?? 0), 0), subtotalMinor)
  const netMinor = subtotalMinor - discountMinor
  const rate = supplierTaxRateFor(input.taxCategory, input.taxRate)
  const taxMinor = roundHalfUp((netMinor * rate) / 100)
  return {
    id: input.id,
    quantity: qty,
    supplierCostUnit: fromMinor(costMinor),
    lineSubtotal: fromMinor(subtotalMinor),
    discountAmount: fromMinor(discountMinor),
    lineNetTotal: fromMinor(netMinor),
    taxCategory: input.taxCategory,
    taxRate: rate,
    lineTaxTotal: fromMinor(taxMinor),
    lineGrossTotal: fromMinor(netMinor + taxMinor),
    unknownTax: input.taxCategory === 'unknown',
  }
}

// ── PO document calculation ──────────────────────────────────

export interface CalcPoInput {
  lines: CalcPoLineInput[]
  shippingTotal: number
  packagingTotal: number
  otherChargesTotal: number
  /** Additional document-level supplier discount (absolute, major units). */
  documentDiscount: number
  /** Tax rate applied to shipping/packaging/other charges, or null for none. */
  chargesTaxRate: number | null
}

export interface CalcPoResult {
  lines: CalcPoLineResult[]
  lineSubtotal: number
  lineDiscountTotal: number
  documentDiscount: number
  discountTotal: number
  shippingTotal: number
  packagingTotal: number
  otherChargesTotal: number
  chargesTotal: number
  netSubtotal: number
  taxByCategory: Partial<Record<SupplierTaxCategory, number>>
  taxTotal: number
  grandTotal: number
  hasUnknownTax: boolean
}

export function calculatePurchaseOrder(input: CalcPoInput): CalcPoResult {
  const lines = input.lines.map(calculatePoLine)

  const lineSubtotalMinor = lines.reduce((s, l) => s + toMinor(l.lineSubtotal), 0)
  const lineDiscountMinor = lines.reduce((s, l) => s + toMinor(l.discountAmount), 0)
  const lineNetMinor = lines.reduce((s, l) => s + toMinor(l.lineNetTotal), 0)

  const shippingMinor = Math.max(toMinor(input.shippingTotal ?? 0), 0)
  const packagingMinor = Math.max(toMinor(input.packagingTotal ?? 0), 0)
  const otherMinor = Math.max(toMinor(input.otherChargesTotal ?? 0), 0)
  const chargesMinor = shippingMinor + packagingMinor + otherMinor

  const docDiscountMinor = Math.min(Math.max(toMinor(input.documentDiscount ?? 0), 0), lineNetMinor + chargesMinor)

  const netMinor = lineNetMinor + chargesMinor - docDiscountMinor

  const taxByCategory: Partial<Record<SupplierTaxCategory, number>> = {}
  let taxMinor = 0
  for (const l of lines) {
    const m = toMinor(l.lineTaxTotal)
    if (m !== 0 || l.taxRate > 0) {
      taxByCategory[l.taxCategory] = (taxByCategory[l.taxCategory] ?? 0) + fromMinor(m)
    }
    taxMinor += m
  }
  if (input.chargesTaxRate != null && chargesMinor > 0) {
    const chargeTaxMinor = roundHalfUp((chargesMinor * input.chargesTaxRate) / 100)
    taxByCategory.standard = (taxByCategory.standard ?? 0) + fromMinor(chargeTaxMinor)
    taxMinor += chargeTaxMinor
  }

  return {
    lines,
    lineSubtotal: fromMinor(lineSubtotalMinor),
    lineDiscountTotal: fromMinor(lineDiscountMinor),
    documentDiscount: fromMinor(docDiscountMinor),
    discountTotal: fromMinor(lineDiscountMinor + docDiscountMinor),
    shippingTotal: fromMinor(shippingMinor),
    packagingTotal: fromMinor(packagingMinor),
    otherChargesTotal: fromMinor(otherMinor),
    chargesTotal: fromMinor(chargesMinor),
    netSubtotal: fromMinor(netMinor),
    taxByCategory,
    taxTotal: fromMinor(taxMinor),
    grandTotal: fromMinor(netMinor + taxMinor),
    hasUnknownTax: lines.some(l => l.unknownTax),
  }
}

// ── Approval evaluation ──────────────────────────────────────

export interface PoApprovalContext {
  /** PO grand total above this requires approval (null = disabled). */
  valueThreshold: number | null
  /** Shipping+packaging+other above this requires approval (null = disabled). */
  freightThreshold: number | null
  manufacturerActive: boolean
  /** Any line cost differs from its source allocation cost. */
  costDiffersFromAllocation: boolean
  /** Any line quantity differs from its allocation quantity. */
  quantityDiffersFromAllocation: boolean
  /** PO currency differs from the manufacturer/product default. */
  currencyDiffersFromDefault: boolean
  /** Any line supplier cost manually overridden. */
  costOverridden: boolean
  /** Margin-at-risk analysis flagged deterioration below thresholds. */
  marginAtRisk: boolean
}

export interface PoApprovalResult {
  required: boolean
  blocked: boolean
  reasons: string[]
}

export function evaluatePoApproval(calc: CalcPoResult, ctx: PoApprovalContext): PoApprovalResult {
  const reasons: string[] = []
  let blocked = false

  if (calc.hasUnknownTax) {
    blocked = true
    reasons.push('One or more lines have unknown supplier tax treatment — confirm the tax category before issue.')
  }
  if (calc.lines.length === 0) {
    blocked = true
    reasons.push('The purchase order has no lines.')
  }
  if (ctx.valueThreshold != null && calc.grandTotal > ctx.valueThreshold) {
    reasons.push(`PO total ${calc.grandTotal.toFixed(2)} exceeds the configured approval threshold (${ctx.valueThreshold}).`)
  }
  if (ctx.freightThreshold != null && calc.chargesTotal > ctx.freightThreshold) {
    reasons.push(`Freight/charges ${calc.chargesTotal.toFixed(2)} exceed the configured threshold (${ctx.freightThreshold}).`)
  }
  if (!ctx.manufacturerActive) reasons.push('Manufacturer is marked inactive.')
  if (ctx.costDiffersFromAllocation) reasons.push('Supplier cost differs from the source allocation.')
  if (ctx.quantityDiffersFromAllocation) reasons.push('Quantity differs from the allocated sales-order quantity.')
  if (ctx.currencyDiffersFromDefault) reasons.push('Currency differs from the supplier default.')
  if (ctx.costOverridden) reasons.push('Supplier cost was manually overridden.')
  if (ctx.marginAtRisk) reasons.push('Margin at risk: supplier commitment reduces the client-order margin below configured thresholds.')

  // Blocked conditions stand alone; any other reason requires approval.
  const required = blocked || reasons.length > 0
  return { required, blocked, reasons }
}

// ── Margin-at-risk analysis (internal only) ──────────────────

export interface MarginAtRiskInput {
  /** Client net selling value of the source lines covered by this PO (major units). */
  clientNetSelling: number
  /** Expected supplier cost at allocation time (major units). */
  originalExpectedCost: number
  /** Current PO supplier cost (net, major units). */
  currentPoCost: number
  /** Sprint 1 approval thresholds. */
  marginCommercialBelow: number
  marginUltraBelow: number
}

export interface MarginAtRiskResult {
  clientNetSelling: number
  originalExpectedCost: number
  currentPoCost: number
  costVariance: number
  expectedGrossProfit: number
  expectedMarginPercent: number | null
  originalMarginPercent: number | null
  marginChangePercent: number | null
  atRisk: boolean
  level: 'none' | 'commercial' | 'ultra'
}

export function analyseMarginAtRisk(input: MarginAtRiskInput): MarginAtRiskResult {
  const sell = toMinor(input.clientNetSelling)
  const orig = toMinor(input.originalExpectedCost)
  const curr = toMinor(input.currentPoCost)
  const profit = sell - curr
  const margin = sell > 0 ? (profit / sell) * 100 : null
  const originalMargin = sell > 0 ? ((sell - orig) / sell) * 100 : null

  let level: MarginAtRiskResult['level'] = 'none'
  if (margin !== null) {
    if (margin < input.marginUltraBelow) level = 'ultra'
    else if (margin < input.marginCommercialBelow) level = 'commercial'
  }
  // Only flag "at risk" when the supplier cost INCREASED the risk (i.e. the
  // PO cost exceeds the original expectation) or margin sits below thresholds.
  const atRisk = level !== 'none' && curr > orig

  return {
    clientNetSelling: fromMinor(sell),
    originalExpectedCost: fromMinor(orig),
    currentPoCost: fromMinor(curr),
    costVariance: fromMinor(curr - orig),
    expectedGrossProfit: fromMinor(profit),
    expectedMarginPercent: margin,
    originalMarginPercent: originalMargin,
    marginChangePercent: margin !== null && originalMargin !== null ? margin - originalMargin : null,
    atRisk: atRisk || (level !== 'none' && curr > orig),
    level: curr > orig ? level : 'none',
  }
}

// ── Supplier-safe output guard ───────────────────────────────

/** Field names that must NEVER appear in supplier-facing payloads. */
export const SUPPLIER_FORBIDDEN_FIELDS = [
  'selling_price_unit', 'unit_price', 'line_net_total_client', 'markup', 'margin',
  'marginPercent', 'markupPercent', 'pricing_percent', 'procurement_fee',
  'deposit', 'client_discount', 'effectiveMarginPercent', 'effectiveMarkupPercent',
  'margin_analysis', 'internal_notes',
] as const

/** Deep-scan an object for forbidden client-side commercial fields. */
export function findForbiddenSupplierFields(obj: unknown, path = ''): string[] {
  const hits: string[] = []
  if (obj === null || typeof obj !== 'object') return hits
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k
    if ((SUPPLIER_FORBIDDEN_FIELDS as readonly string[]).includes(k)) hits.push(p)
    if (v && typeof v === 'object') hits.push(...findForbiddenSupplierFields(v, p))
  }
  return hits
}
