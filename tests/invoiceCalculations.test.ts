// ============================================================
// Client invoice calculation tests (Sprint 3, spec §21).
// Node built-in test runner: npm test
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateInvoice, calculateInvoiceLine, invoiceBalance, deriveInvoiceStatus,
  isOverdue, calculateDeposit, remainingInvoiceable, assertInvoiceable,
  checkPaymentAllocation, checkCreditNoteAmount, findForbiddenClientInvoiceFields,
} from '../lib/commercial/invoiceCalculations'

// Invoice totals reconcile
test('invoice totals reconcile: net + VAT = gross', () => {
  const r = calculateInvoice({
    vatRegistered: true,
    lines: [
      { quantity: 2, unitPrice: 100, discountAmount: 10, taxCategory: 'standard', taxRate: 20 },
      { quantity: 1, unitPrice: 50, discountAmount: 0, taxCategory: 'zero', taxRate: null },
    ],
  })
  // net: (200-10) + 50 = 240; VAT: 20% of 190 = 38
  assert.equal(r.subtotal, 240)
  assert.equal(r.taxByCategory.standard, 38)
  assert.equal(r.taxTotal, 38)
  assert.equal(r.grossTotal, 278)
  assert.ok(Math.abs((r.subtotal + r.taxTotal) - r.grossTotal) < 0.005)
})

test('VAT-unregistered invoices apply no VAT', () => {
  const r = calculateInvoice({
    vatRegistered: false,
    lines: [{ quantity: 1, unitPrice: 100, discountAmount: 0, taxCategory: 'standard', taxRate: 20 }],
  })
  assert.equal(r.taxTotal, 0)
  assert.equal(r.grossTotal, 100)
})

// 5. Deposit invoice uses configured basis
test('deposit uses configured basis and percent', () => {
  const gross = 1200, net = 1000
  assert.equal(calculateDeposit({ netSubtotal: net, grossTotal: gross, depositPercent: 25, basis: 'gross_total' }), 300)
  assert.equal(calculateDeposit({ netSubtotal: net, grossTotal: gross, depositPercent: 25, basis: 'net_subtotal' }), 250)
  // authorised override wins
  assert.equal(calculateDeposit({ netSubtotal: net, grossTotal: gross, depositPercent: 25, basis: 'gross_total', override: 400 }), 400)
})

// 6. Stage invoice cannot exceed remaining invoiceable value
test('stage invoice cannot exceed remaining invoiceable value', () => {
  const state = { orderGross: 1000, approvedVariations: 0, priorInvoiced: 600, creditNotes: 0 }
  assert.equal(remainingInvoiceable(state), 400)
  assert.equal(assertInvoiceable(400, state).ok, true)
  const over = assertInvoiceable(401, state)
  assert.equal(over.ok, false)
  assert.ok(over.error && over.error.includes('exceeds'))
})

// 7. Final invoice reconciles prior invoices and credits
test('final invoice remaining = order + variations − prior invoices − credits', () => {
  const state = { orderGross: 1000, approvedVariations: 150, priorInvoiced: 300, creditNotes: 50 }
  // 1000 + 150 - 300 - 50 = 800
  assert.equal(remainingInvoiceable(state), 800)
})

// 8. Over-invoicing is blocked
test('over-invoicing beyond remaining is blocked', () => {
  const state = { orderGross: 500, approvedVariations: 0, priorInvoiced: 500, creditNotes: 0 }
  assert.equal(remainingInvoiceable(state), 0)
  assert.equal(assertInvoiceable(0.01, state).ok, false)
})

// 11. Payment allocation cannot exceed payment balance
test('payment allocation cannot exceed unallocated payment balance', () => {
  const r = checkPaymentAllocation({
    paymentCurrency: 'GBP', invoiceCurrency: 'GBP',
    paymentAmount: 500, alreadyAllocatedOnPayment: 400, invoiceOutstanding: 1000, requested: 200,
  })
  assert.equal(r.ok, false)
  assert.ok(r.error && r.error.includes('payment balance'))
})

// 12. Payment allocation cannot exceed invoice balance
test('payment allocation cannot exceed invoice outstanding', () => {
  const r = checkPaymentAllocation({
    paymentCurrency: 'GBP', invoiceCurrency: 'GBP',
    paymentAmount: 1000, alreadyAllocatedOnPayment: 0, invoiceOutstanding: 150, requested: 200,
  })
  assert.equal(r.ok, false)
  assert.ok(r.error && r.error.includes('invoice outstanding'))
})

// 13. Currency mismatch is blocked
test('currency mismatch blocks allocation', () => {
  const r = checkPaymentAllocation({
    paymentCurrency: 'USD', invoiceCurrency: 'GBP',
    paymentAmount: 1000, alreadyAllocatedOnPayment: 0, invoiceOutstanding: 1000, requested: 100,
  })
  assert.equal(r.ok, false)
  assert.ok(r.error && r.error.includes('Currency'))
})

test('valid allocation within both balances is accepted', () => {
  const r = checkPaymentAllocation({
    paymentCurrency: 'GBP', invoiceCurrency: 'GBP',
    paymentAmount: 500, alreadyAllocatedOnPayment: 100, invoiceOutstanding: 1000, requested: 300,
  })
  assert.equal(r.ok, true)
})

// 15. Invoice paid status derives from allocations
test('invoice paid status derives from allocations', () => {
  assert.equal(deriveInvoiceStatus({ grossTotal: 1000, amountPaid: 1000, creditTotal: 0, dueDate: '2026-01-01' }), 'paid')
  assert.equal(invoiceBalance(1000, 1000, 0), 0)
})

// 16. Partial payment produces partially-paid status
test('partial payment produces partially_paid', () => {
  assert.equal(deriveInvoiceStatus({ grossTotal: 1000, amountPaid: 400, creditTotal: 0, dueDate: '2999-01-01' }), 'partially_paid')
  assert.equal(invoiceBalance(1000, 400, 0), 600)
})

// credit fully settling an invoice → credited
test('invoice fully settled by credit note → credited', () => {
  assert.equal(deriveInvoiceStatus({ grossTotal: 500, amountPaid: 0, creditTotal: 500, dueDate: '2026-01-01' }), 'credited')
})

// 17. Overdue status derives correctly (and paid never overdue)
test('overdue derives from due date; paid invoices are never overdue', () => {
  assert.equal(isOverdue({ locked: true, balanceDue: 200, dueDate: '2020-01-01', today: '2026-07-12' }), true)
  assert.equal(isOverdue({ locked: true, balanceDue: 0, dueDate: '2020-01-01', today: '2026-07-12' }), false)
  assert.equal(isOverdue({ locked: false, balanceDue: 200, dueDate: '2020-01-01', today: '2026-07-12' }), false)
  assert.equal(deriveInvoiceStatus({ grossTotal: 1000, amountPaid: 0, creditTotal: 0, dueDate: '2020-01-01', today: '2026-07-12' }), 'overdue')
})

// 20. Credit note cannot exceed eligible invoice amount
test('credit note cannot exceed eligible invoice amount', () => {
  assert.equal(checkCreditNoteAmount({ creditNoteGross: 300, eligibleInvoiceAmount: 250 }).ok, false)
  assert.equal(checkCreditNoteAmount({ creditNoteGross: 250, eligibleInvoiceAmount: 250 }).ok, true)
})

// 21. Client documents exclude supplier cost and margin
test('client invoice payload scanner catches supplier cost and margin fields', () => {
  const safe = {
    invoice_number: 'FBA-INV-2026-0001',
    lines: [{ name_snapshot: 'Chair', unit_price: 300, quantity: 2, line_net_total: 600 }],
    totals: { subtotal: 600, tax_total: 120, gross_total: 720 },
  }
  assert.deepEqual(findForbiddenClientInvoiceFields(safe), [])

  const leaky = {
    lines: [{ name_snapshot: 'Chair', unit_price: 300, supplier_cost_unit: 150 }],
    analysis: { marginPercent: 50 },
  }
  const hits = findForbiddenClientInvoiceFields(leaky)
  assert.ok(hits.some(h => h.includes('supplier_cost_unit')))
  assert.ok(hits.some(h => h.includes('marginPercent')))
})

// Line discount caps at subtotal
test('invoice line discount caps at the line subtotal', () => {
  const l = calculateInvoiceLine({ quantity: 1, unitPrice: 100, discountAmount: 150, taxCategory: 'standard', taxRate: 20 })
  assert.equal(l.discountAmount, 100)
  assert.equal(l.lineNetTotal, 0)
  assert.equal(l.lineTaxTotal, 0)
})
