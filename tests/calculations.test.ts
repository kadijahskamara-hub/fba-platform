// ============================================================
// Commercial calculation engine tests (Sprint 1, spec §18).
// Runs on Node's built-in test runner — no framework added:
//   npm test  →  tsc -p tsconfig.test.json && node --test
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateDocument, calculateLine, deriveSellingMinor, verifyClientTotals,
  toMinor, fromMinor, resolveDepositPercent,
} from '../lib/commercial/calculations'
import type { CalcDocInput, CalcLineInput } from '../lib/commercial/types'
import { DEFAULT_APPROVAL_THRESHOLDS } from '../lib/commercial/types'

const RATES = { standard: 20, reduced: 5 }

function line(overrides: Partial<CalcLineInput> = {}): CalcLineInput {
  return {
    lineType: 'product',
    quantity: 1,
    supplierCostUnit: 100,
    pricingMethod: 'markup',
    pricingPercent: 50,
    sellingPriceUnit: null,
    discountType: null,
    discountValue: null,
    taxCategory: 'standard',
    procurementFeeEligible: true,
    ...overrides,
  }
}

function doc(overrides: Partial<CalcDocInput> = {}): CalcDocInput {
  return {
    lines: [line()],
    vatRegistered: true,
    taxRates: RATES,
    depositPercent: 50,
    depositBasis: 'gross_total',
    procurementFee: { type: 'none', basis: 'product_selling_subtotal', value: 0 },
    paymentsReceived: 0,
    thresholds: { ...DEFAULT_APPROVAL_THRESHOLDS },
    ...overrides,
  }
}

// 1. 30% markup from £100 cost → £130 selling
test('markup 30% on £100 cost gives £130 selling price', () => {
  const r = calculateLine(line({ pricingPercent: 30 }), true, RATES)
  assert.equal(r.sellingPriceUnit, 130)
})

// 2. 30% margin from £100 cost → ≈£142.86
test('margin 30% on £100 cost gives ~£142.86 selling price', () => {
  const r = calculateLine(line({ pricingMethod: 'margin', pricingPercent: 30 }), true, RATES)
  assert.equal(r.sellingPriceUnit, 142.86)
})

// 3. Switching markup → margin preserves cost
test('switching method recalculates selling from the same cost basis', () => {
  const markup = calculateLine(line({ pricingPercent: 30 }), true, RATES)
  const margin = calculateLine(line({ pricingMethod: 'margin', pricingPercent: 30 }), true, RATES)
  assert.equal(markup.supplierCostUnit, 100)
  assert.equal(margin.supplierCostUnit, 100) // cost untouched
  assert.notEqual(markup.sellingPriceUnit, margin.sellingPriceUnit)
})

// 4. Zero-cost handling
test('zero cost is flagged and never crashes', () => {
  const r = calculateLine(line({ supplierCostUnit: 0, pricingPercent: 30 }), true, RATES)
  assert.equal(r.sellingPriceUnit, 0)
  assert.equal(r.flags.zeroCost, true)
  const inv = deriveSellingMinor(0, 'margin', 100)
  assert.equal(inv.invalid, true) // margin ≥ 100% is invalid
})

// 5. Negative-margin blocking
test('negative margin line blocks the document', () => {
  const d = calculateDocument(doc({
    lines: [line({ pricingMethod: 'manual', sellingPriceUnit: 80 })], // cost 100, sell 80
  }))
  assert.equal(d.approval.level, 'blocked')
  assert.ok(d.approval.reasons.some(r => r.includes('Negative margin')))
})

// 6. Percentage discount
test('10% discount on £200 line yields £180 net', () => {
  const r = calculateLine(line({
    pricingMethod: 'manual', sellingPriceUnit: 200,
    discountType: 'percent', discountValue: 10, supplierCostUnit: null,
  }), true, RATES)
  assert.equal(r.discountAmount, 20)
  assert.equal(r.lineNetTotal, 180)
})

// 7. Fixed discount
test('fixed £25 discount is applied and capped at the line value', () => {
  const r = calculateLine(line({ pricingMethod: 'manual', sellingPriceUnit: 200, supplierCostUnit: null, discountType: 'fixed', discountValue: 25 }), true, RATES)
  assert.equal(r.discountAmount, 25)
  assert.equal(r.lineNetTotal, 175)
  const capped = calculateLine(line({ pricingMethod: 'manual', sellingPriceUnit: 10, supplierCostUnit: null, discountType: 'fixed', discountValue: 25 }), true, RATES)
  assert.equal(capped.lineNetTotal, 0) // never negative
})

// 8. Standard VAT
test('standard VAT 20% applies to the net amount', () => {
  const r = calculateLine(line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null }), true, RATES)
  assert.equal(r.lineTaxTotal, 20)
  assert.equal(r.lineGrossTotal, 120)
})

// 9. Zero-rated line
test('zero-rated line carries no VAT', () => {
  const r = calculateLine(line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null, taxCategory: 'zero' }), true, RATES)
  assert.equal(r.lineTaxTotal, 0)
  assert.equal(r.lineGrossTotal, 100)
})

// 10. Mixed VAT categories
test('mixed VAT categories are totalled per category', () => {
  const d = calculateDocument(doc({
    lines: [
      line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null }),                    // standard: 20
      line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null, taxCategory: 'reduced' }), // reduced: 5
      line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null, taxCategory: 'exempt' }),  // 0
    ],
  }))
  assert.equal(d.vatByCategory.standard, 20)
  assert.equal(d.vatByCategory.reduced, 5)
  assert.equal(d.vatTotal, 25)
  assert.equal(d.grossTotal, 325)
})

// 11. Product and service subtotals
test('product and service subtotals are separated', () => {
  const d = calculateDocument(doc({
    lines: [
      line({ pricingMethod: 'manual', sellingPriceUnit: 500, supplierCostUnit: 250 }),
      line({ lineType: 'service', pricingMethod: 'manual', sellingPriceUnit: 300, supplierCostUnit: null }),
      line({ lineType: 'delivery', pricingMethod: 'manual', sellingPriceUnit: 50, supplierCostUnit: null }),
    ],
  }))
  assert.equal(d.productSellingSubtotal, 500)
  assert.equal(d.serviceSubtotal, 300)
  assert.equal(d.otherChargesSubtotal, 50)
  assert.equal(d.netSubtotal, 850)
})

// 12. Procurement percentage fee
test('12% procurement fee on the product selling subtotal', () => {
  const d = calculateDocument(doc({
    lines: [line({ pricingMethod: 'manual', sellingPriceUnit: 85000, supplierCostUnit: null })],
    procurementFee: { type: 'percentage', basis: 'product_selling_subtotal', value: 12 },
  }))
  assert.equal(d.procurementFeeBasisAmount, 85000)
  assert.equal(d.procurementFee, 10200)
  assert.equal(d.netSubtotal, 95200)
})

// 13. Fixed procurement fee
test('fixed procurement fee is added regardless of basis amount', () => {
  const d = calculateDocument(doc({
    procurementFee: { type: 'fixed', basis: 'product_selling_subtotal', value: 1500 },
  }))
  assert.equal(d.procurementFee, 1500)
})

// 14. Deposit calculation
test('deposit requested is 50% of gross total (and labelled requested, not paid)', () => {
  const d = calculateDocument(doc({
    lines: [line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null })],
  }))
  assert.equal(d.grossTotal, 120)
  assert.equal(d.depositRequested, 60)
  assert.equal(d.paymentsReceived, 0) // separate concept
  assert.equal(d.balanceDue, 120)
})

// 15. Rounding across multiple quantities
test('rounding: 3 × £33.335 rounds once at line level (minor units, half-up)', () => {
  const r = calculateLine(line({ pricingMethod: 'manual', sellingPriceUnit: 33.335, supplierCostUnit: null, quantity: 3 }), true, RATES)
  // unit stored as 3334p (33.34) → 3 × 3334 = 10002p = £100.02
  assert.equal(r.lineNetTotal, 100.02)
  assert.equal(toMinor(fromMinor(toMinor(33.335))), 3334)
})

// 16. Quote-level total reconciliation
test('document totals reconcile: net + VAT = gross; sections sum to net', () => {
  const d = calculateDocument(doc({
    lines: [
      line({ pricingPercent: 30 }),                                                      // 130 std
      line({ lineType: 'service', pricingMethod: 'manual', sellingPriceUnit: 250, supplierCostUnit: null }),
      line({ pricingMethod: 'manual', sellingPriceUnit: 99.99, supplierCostUnit: 50, discountType: 'percent', discountValue: 5 }),
    ],
    procurementFee: { type: 'percentage', basis: 'product_selling_subtotal', value: 10 },
  }))
  const sections = d.productSellingSubtotal + d.serviceSubtotal + d.otherChargesSubtotal + d.procurementFee
  assert.ok(Math.abs(sections - d.netSubtotal) < 0.011)
  assert.ok(Math.abs(d.netSubtotal + d.vatTotal - d.grossTotal) < 0.011)
})

// 17. Approval threshold at exactly 30%
test('margin of exactly 30% requires no approval', () => {
  // margin 30%: cost 70, sell 100
  const d = calculateDocument(doc({
    lines: [line({ supplierCostUnit: 70, pricingMethod: 'manual', sellingPriceUnit: 100 })],
  }))
  assert.equal(d.approval.level, 'none')
})

// 18. Approval threshold below 30%
test('margin below 30% requires Commercial Admin approval', () => {
  const d = calculateDocument(doc({
    lines: [line({ supplierCostUnit: 75, pricingMethod: 'manual', sellingPriceUnit: 100 })], // 25% margin
  }))
  assert.equal(d.approval.level, 'commercial')
})

// 19. Ultra Admin threshold below 20%
test('margin below 20% requires Ultra Admin approval', () => {
  const d = calculateDocument(doc({
    lines: [line({ supplierCostUnit: 90, pricingMethod: 'manual', sellingPriceUnit: 100 })], // 10% margin
  }))
  assert.equal(d.approval.level, 'ultra')
})

// 20. Discount approval thresholds
test('discounts above 10% / 20% escalate approval', () => {
  const base = { pricingMethod: 'manual' as const, sellingPriceUnit: 100, supplierCostUnit: null }
  const c = calculateDocument(doc({ lines: [line({ ...base, discountType: 'percent', discountValue: 15 })] }))
  assert.equal(c.approval.level, 'commercial')
  const u = calculateDocument(doc({ lines: [line({ ...base, discountType: 'percent', discountValue: 25 })] }))
  assert.equal(u.approval.level, 'ultra')
  const ok = calculateDocument(doc({ lines: [line({ ...base, discountType: 'percent', discountValue: 10 })] }))
  assert.equal(ok.approval.level, 'none')
})

// 23. Server rejection of tampered client totals
test('tampered client totals are detected', () => {
  const d = calculateDocument(doc({
    lines: [line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null })],
  }))
  assert.deepEqual(verifyClientTotals({ grossTotal: 120 }, d), [])
  const mismatches = verifyClientTotals({ grossTotal: 1.99, netSubtotal: 100 }, d)
  assert.equal(mismatches.length, 1)
  assert.match(mismatches[0], /grossTotal/)
})

// Supporting behaviours
test('cost-unavailable lines never fabricate margins', () => {
  const d = calculateDocument(doc({
    lines: [line({ supplierCostUnit: null, pricingMethod: 'manual', sellingPriceUnit: 100 })],
  }))
  assert.equal(d.costIncomplete, true)
  assert.equal(d.effectiveMarginPercent, null)
  assert.equal(d.productCostSubtotal, null)
  assert.equal(d.approval.level, 'none') // unknown cost is not treated as negative margin
})

test('manual supplier-cost override requires Commercial Admin approval', () => {
  const d = calculateDocument(doc({ supplierCostOverridden: true }))
  assert.equal(d.approval.level, 'commercial')
})

test('procurement fee override requires Commercial Admin approval', () => {
  const d = calculateDocument(doc({
    procurementFee: { type: 'percentage', basis: 'product_selling_subtotal', value: 10, override: 500 },
  }))
  assert.equal(d.procurementFee, 500)
  assert.equal(d.procurementFeeOverridden, true)
  assert.equal(d.approval.level, 'commercial')
})

test('deposit value rules override the default by order value', () => {
  const rules = [
    { min_order_value: 0, deposit_percent: 100 },     // small orders: full payment
    { min_order_value: 2000, deposit_percent: 50 },   // larger orders: 50%
  ]
  assert.equal(resolveDepositPercent(50, rules, 1500), 100)
  assert.equal(resolveDepositPercent(50, rules, 5000), 50)
  assert.equal(resolveDepositPercent(50, [], 5000), 50)
})

test('VAT-unregistered documents apply no VAT anywhere', () => {
  const d = calculateDocument(doc({
    vatRegistered: false,
    lines: [line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null })],
    procurementFee: { type: 'fixed', basis: 'product_selling_subtotal', value: 100 },
  }))
  assert.equal(d.vatTotal, 0)
  assert.equal(d.grossTotal, 200)
})
