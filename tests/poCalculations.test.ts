// ============================================================
// Supplier purchase-order calculation tests (Sprint 2, spec §23).
// Node built-in test runner: npm test
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculatePurchaseOrder, calculatePoLine, evaluatePoApproval,
  analyseMarginAtRisk, assessAllocationReadiness, lineEligibleForProcurement,
  findForbiddenSupplierFields, CalcPoInput, PoApprovalContext,
} from '../lib/commercial/poCalculations'

function poInput(overrides: Partial<CalcPoInput> = {}): CalcPoInput {
  return {
    lines: [{ quantity: 2, supplierCostUnit: 100, discountAmount: 0, taxCategory: 'standard', taxRate: 20 }],
    shippingTotal: 0, packagingTotal: 0, otherChargesTotal: 0,
    documentDiscount: 0, chargesTaxRate: null,
    ...overrides,
  }
}

function ctx(overrides: Partial<PoApprovalContext> = {}): PoApprovalContext {
  return {
    valueThreshold: null, freightThreshold: null, manufacturerActive: true,
    costDiffersFromAllocation: false, quantityDiffersFromAllocation: false,
    currencyDiffersFromDefault: false, costOverridden: false, marginAtRisk: false,
    ...overrides,
  }
}

// 3. Service lines are excluded from procurement by default
test('service lines are not procurement-eligible; product/delivery/installation are', () => {
  assert.equal(lineEligibleForProcurement('service'), false)
  assert.equal(lineEligibleForProcurement('fee'), false)
  assert.equal(lineEligibleForProcurement('adjustment'), false)
  assert.equal(lineEligibleForProcurement('product'), true)
  assert.equal(lineEligibleForProcurement('delivery'), true)
  assert.equal(lineEligibleForProcurement('installation'), true)
})

// 4. Missing supplier cost blocks readiness
test('missing supplier cost blocks allocation readiness', () => {
  const r = assessAllocationReadiness({
    manufacturerId: 'm1', supplierCostUnit: null, supplierCurrency: 'GBP',
    quantity: 1, sourceQuantity: 1,
  })
  assert.equal(r.ready, false)
  assert.ok(r.problems.some(p => p.includes('Supplier cost unavailable')))
})

// 5. Missing manufacturer blocks allocation
test('missing manufacturer blocks allocation readiness', () => {
  const r = assessAllocationReadiness({
    manufacturerId: null, supplierCostUnit: 50, supplierCurrency: 'GBP',
    quantity: 1, sourceQuantity: 1,
  })
  assert.equal(r.ready, false)
  assert.ok(r.problems.some(p => p.includes('No manufacturer')))
})

// 6. Allocation quantity cannot exceed sales-order quantity
test('allocation quantity cannot exceed the client-order quantity (incl. split allocations)', () => {
  const over = assessAllocationReadiness({
    manufacturerId: 'm1', supplierCostUnit: 50, supplierCurrency: 'GBP',
    quantity: 5, sourceQuantity: 4,
  })
  assert.equal(over.ready, false)
  assert.ok(over.problems.some(p => p.includes('exceeds the client-order quantity')))

  const split = assessAllocationReadiness({
    manufacturerId: 'm1', supplierCostUnit: 50, supplierCurrency: 'GBP',
    quantity: 2, sourceQuantity: 4, otherAllocatedQuantity: 3,
  })
  assert.equal(split.ready, false)

  const ok = assessAllocationReadiness({
    manufacturerId: 'm1', supplierCostUnit: 50, supplierCurrency: 'GBP',
    quantity: 2, sourceQuantity: 4, otherAllocatedQuantity: 2,
  })
  assert.equal(ok.ready, true)
})

// 7. Supplier PO uses cost (not client selling price) — the engine only
//    accepts supplierCostUnit; verify arithmetic uses it.
test('PO line totals derive from supplier cost', () => {
  const l = calculatePoLine({ quantity: 3, supplierCostUnit: 250, discountAmount: 0, taxCategory: 'zero', taxRate: null })
  assert.equal(l.lineNetTotal, 750)
  assert.equal(l.lineGrossTotal, 750)
})

// 9. PO totals reconcile
test('PO totals reconcile: lines + charges − discounts + tax = grand total', () => {
  const r = calculatePurchaseOrder(poInput({
    lines: [
      { quantity: 2, supplierCostUnit: 100, discountAmount: 10, taxCategory: 'standard', taxRate: 20 },
      { quantity: 1, supplierCostUnit: 59.99, discountAmount: 0, taxCategory: 'zero', taxRate: null },
    ],
    shippingTotal: 45, packagingTotal: 15, documentDiscount: 5,
  }))
  // lines net: (200-10) + 59.99 = 249.99; charges 60; doc discount 5 → net 304.99
  assert.equal(r.netSubtotal, 304.99)
  // tax: 20% of 190 = 38
  assert.equal(r.taxTotal, 38)
  assert.equal(r.grandTotal, 342.99)
  assert.ok(Math.abs((r.netSubtotal + r.taxTotal) - r.grandTotal) < 0.005)
})

// 10. Supplier tax categories calculate correctly
test('supplier tax categories: standard/reduced rated, others zero', () => {
  const r = calculatePurchaseOrder(poInput({
    lines: [
      { quantity: 1, supplierCostUnit: 100, discountAmount: 0, taxCategory: 'standard', taxRate: 20 },
      { quantity: 1, supplierCostUnit: 100, discountAmount: 0, taxCategory: 'reduced', taxRate: 5 },
      { quantity: 1, supplierCostUnit: 100, discountAmount: 0, taxCategory: 'reverse_charge', taxRate: null },
      { quantity: 1, supplierCostUnit: 100, discountAmount: 0, taxCategory: 'exempt', taxRate: null },
    ],
  }))
  assert.equal(r.taxByCategory.standard, 20)
  assert.equal(r.taxByCategory.reduced, 5)
  assert.equal(r.taxTotal, 25)
})

// 11. Unknown supplier tax blocks issue
test('unknown supplier tax blocks approval/issue', () => {
  const r = calculatePurchaseOrder(poInput({
    lines: [{ quantity: 1, supplierCostUnit: 100, discountAmount: 0, taxCategory: 'unknown', taxRate: null }],
  }))
  assert.equal(r.hasUnknownTax, true)
  const approval = evaluatePoApproval(r, ctx())
  assert.equal(approval.blocked, true)
  assert.ok(approval.reasons.some(x => x.includes('unknown supplier tax')))
})

// 12/13. Cost override + thresholds trigger approval
test('cost override, thresholds and inactive manufacturer trigger approval', () => {
  const calc = calculatePurchaseOrder(poInput({ shippingTotal: 500 }))
  const a = evaluatePoApproval(calc, ctx({ costOverridden: true }))
  assert.equal(a.required, true)
  assert.ok(a.reasons.some(r => r.includes('manually overridden')))

  const b = evaluatePoApproval(calc, ctx({ valueThreshold: 100 }))
  assert.equal(b.required, true)

  const c = evaluatePoApproval(calc, ctx({ freightThreshold: 100 }))
  assert.equal(c.required, true)

  const d = evaluatePoApproval(calc, ctx({ manufacturerActive: false }))
  assert.equal(d.required, true)

  const clean = evaluatePoApproval(calculatePurchaseOrder(poInput()), ctx())
  assert.equal(clean.required, false)
  assert.equal(clean.blocked, false)
})

// 23. Margin-at-risk triggered by supplier-cost increase
test('margin-at-risk triggers when a cost increase pushes margin below thresholds', () => {
  // Client sells at 1000; originally expected cost 600 (40% margin);
  // PO cost rises to 750 → 25% margin < 30% commercial threshold.
  const m = analyseMarginAtRisk({
    clientNetSelling: 1000, originalExpectedCost: 600, currentPoCost: 750,
    marginCommercialBelow: 30, marginUltraBelow: 20,
  })
  assert.equal(m.atRisk, true)
  assert.equal(m.level, 'commercial')
  assert.equal(m.costVariance, 150)
  assert.equal(m.expectedMarginPercent, 25)

  // Below ultra threshold
  const u = analyseMarginAtRisk({
    clientNetSelling: 1000, originalExpectedCost: 600, currentPoCost: 850,
    marginCommercialBelow: 30, marginUltraBelow: 20,
  })
  assert.equal(u.level, 'ultra')

  // No increase → no risk flag even if margin was always thin
  const stable = analyseMarginAtRisk({
    clientNetSelling: 1000, originalExpectedCost: 750, currentPoCost: 750,
    marginCommercialBelow: 30, marginUltraBelow: 20,
  })
  assert.equal(stable.atRisk, false)
})

test('margin-at-risk feeds the PO approval evaluation', () => {
  const calc = calculatePurchaseOrder(poInput())
  const a = evaluatePoApproval(calc, ctx({ marginAtRisk: true }))
  assert.equal(a.required, true)
  assert.ok(a.reasons.some(r => r.includes('Margin at risk')))
})

// 8/24. Supplier-safe output contains no client selling values
test('supplier-safe snapshot scanner catches client commercial fields', () => {
  const safeSnapshot = {
    documentNumber: 'FBA-PO-2026-0001',
    lines: [{ product_name: 'Chair', supplier_cost_unit: 100, quantity: 2, line_net_total: 200 }],
    totals: { netSubtotal: 200, taxTotal: 40, grandTotal: 240 },
  }
  assert.deepEqual(findForbiddenSupplierFields(safeSnapshot), [])

  const leaky = {
    lines: [{ product_name: 'Chair', supplier_cost_unit: 100, selling_price_unit: 300 }],
    analysis: { marginPercent: 66 },
  }
  const hits = findForbiddenSupplierFields(leaky)
  assert.ok(hits.some(hit => hit.includes('selling_price_unit')))
  assert.ok(hits.some(hit => hit.includes('marginPercent')))
})

// Discount handling on PO lines
test('PO line discounts cap at the line subtotal and reduce tax', () => {
  const l = calculatePoLine({ quantity: 1, supplierCostUnit: 100, discountAmount: 150, taxCategory: 'standard', taxRate: 20 })
  assert.equal(l.discountAmount, 100)  // capped
  assert.equal(l.lineNetTotal, 0)
  assert.equal(l.lineTaxTotal, 0)
})

// Empty PO is blocked
test('a PO with no lines is blocked', () => {
  const calc = calculatePurchaseOrder(poInput({ lines: [] }))
  const a = evaluatePoApproval(calc, ctx())
  assert.equal(a.blocked, true)
})
