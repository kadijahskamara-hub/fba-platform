// ============================================================
// Payment → invoice allocation regression tests (Sprint 16).
//
// Guards the accounting bug found in QA: confirmed payments stayed
// permanently unallocated and every invoice showed Paid £0.00 /
// full balance due, because the candidate-invoice lookup matched
// on client_id, which is null across the quote→proforma→order
// flow. These tests pin the allocation maths, the party-matching
// rule and the reconciliation-exception rule.
//
// Node built-in test runner: npm test
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyAllocations, allocationPartyMatches, noCandidateReason,
  unallocatedPaymentExceptions, checkPaymentAllocation, deriveInvoiceStatus,
} from '../lib/commercial/invoiceCalculations'

// ── The exact QA repro: £1,110 invoice, £1,110 confirmed payment ──
test('full allocation moves invoice paid/balance and payment allocated/unallocated together', () => {
  const before = applyAllocations({ grossTotal: 1110, paymentAmount: 1110, toThisInvoice: [] })
  assert.equal(before.paid, 0)
  assert.equal(before.balanceDue, 1110)
  assert.equal(before.unallocated, 1110)

  const after = applyAllocations({ grossTotal: 1110, paymentAmount: 1110, toThisInvoice: [1110] })
  assert.equal(after.paid, 1110, 'invoice.amount_paid')
  assert.equal(after.balanceDue, 0, 'invoice.balance_due')
  assert.equal(after.allocated, 1110, 'payment.allocated')
  assert.equal(after.unallocated, 0, 'payment.unallocated')

  assert.equal(
    deriveInvoiceStatus({ grossTotal: 1110, amountPaid: 1110, creditTotal: 0, dueDate: null }),
    'paid',
  )
})

test('partial allocation leaves a balance and marks the invoice partially paid', () => {
  const r = applyAllocations({ grossTotal: 1110, paymentAmount: 500, toThisInvoice: [500] })
  assert.equal(r.paid, 500)
  assert.equal(r.balanceDue, 610)
  assert.equal(r.unallocated, 0)
  assert.equal(
    deriveInvoiceStatus({ grossTotal: 1110, amountPaid: 500, creditTotal: 0, dueDate: null }),
    'partially_paid',
  )
})

// ── Splitting one payment across two invoices ────────────────
test('one payment splits across two invoices and reconciles to zero unallocated', () => {
  const payment = 1500
  const invA = { gross: 1000 }
  const invB = { gross: 500 }

  const a = applyAllocations({ grossTotal: invA.gross, paymentAmount: payment, toThisInvoice: [1000] })
  assert.equal(a.paid, 1000)
  assert.equal(a.balanceDue, 0)
  assert.equal(a.unallocated, 500, 'payment still has £500 to place')

  const b = applyAllocations({ grossTotal: invB.gross, paymentAmount: payment, toThisInvoice: [500], elsewhereOnPayment: [1000] })
  assert.equal(b.paid, 500, 'invoice B counts only its own share')
  assert.equal(b.balanceDue, 0)
  assert.equal(b.allocated, 1500, 'payment counts every share')
  assert.equal(b.unallocated, 0, 'payment fully allocated after the second invoice')
})

test('split allocation with an uneven remainder keeps pennies balanced', () => {
  const r = applyAllocations({ grossTotal: 333.33, paymentAmount: 1000, toThisInvoice: [333.33], elsewhereOnPayment: [333.33, 333.34] })
  assert.equal(r.paid, 333.33)
  assert.equal(r.allocated, 1000)
  assert.equal(r.unallocated, 0)
})

// ── Validation ───────────────────────────────────────────────
test('rejects allocating more than the payment has left', () => {
  const r = checkPaymentAllocation({
    paymentCurrency: 'GBP', invoiceCurrency: 'GBP',
    paymentAmount: 1000, alreadyAllocatedOnPayment: 800,
    invoiceOutstanding: 5000, requested: 300,
  })
  assert.equal(r.ok, false)
  assert.match(r.error ?? '', /unallocated payment balance/i)
})

test('rejects allocating more than the invoice outstanding balance', () => {
  const r = checkPaymentAllocation({
    paymentCurrency: 'GBP', invoiceCurrency: 'GBP',
    paymentAmount: 5000, alreadyAllocatedOnPayment: 0,
    invoiceOutstanding: 400, requested: 500,
  })
  assert.equal(r.ok, false)
  assert.match(r.error ?? '', /invoice outstanding balance/i)
})

test('rejects a currency mismatch', () => {
  const r = checkPaymentAllocation({
    paymentCurrency: 'EUR', invoiceCurrency: 'GBP',
    paymentAmount: 100, alreadyAllocatedOnPayment: 0,
    invoiceOutstanding: 100, requested: 100,
  })
  assert.equal(r.ok, false)
  assert.match(r.error ?? '', /currency/i)
})

test('allows an exact-to-the-penny full allocation', () => {
  const r = checkPaymentAllocation({
    paymentCurrency: 'GBP', invoiceCurrency: 'GBP',
    paymentAmount: 1110, alreadyAllocatedOnPayment: 0,
    invoiceOutstanding: 1110, requested: 1110,
  })
  assert.equal(r.ok, true)
})

// ── Party matching (the root cause) ──────────────────────────
test('party matches on commercial order when both client ids are null', () => {
  // The exact QA shape: payment and invoice on the same order, no client record.
  assert.equal(allocationPartyMatches(
    { clientId: null, commercialOrderId: 'order-1' },
    { clientId: null, commercialOrderId: 'order-1' },
  ), true)
})

test('party matches on client id when both sides carry one', () => {
  assert.equal(allocationPartyMatches(
    { clientId: 'client-1', commercialOrderId: 'order-1' },
    { clientId: 'client-1', commercialOrderId: 'order-2' },
  ), true)
})

test('party does not match across different clients or orders', () => {
  assert.equal(allocationPartyMatches(
    { clientId: 'client-1' }, { clientId: 'client-2' },
  ), false)
  assert.equal(allocationPartyMatches(
    { clientId: null, commercialOrderId: 'order-1' },
    { clientId: null, commercialOrderId: 'order-2' },
  ), false)
})

test('an unattached payment matches nothing', () => {
  assert.equal(allocationPartyMatches({}, {}), false)
  assert.equal(allocationPartyMatches({ clientId: null, commercialOrderId: null }, { clientId: 'c' }), false)
})

// ── Empty-state reasons ──────────────────────────────────────
test('explains why an unconfirmed payment cannot be allocated', () => {
  const r = noCandidateReason({ paymentStatus: 'pending', unallocated: 100, hasParty: true, candidateCount: 0 })
  assert.match(r ?? '', /only confirmed payments/i)
})

test('explains a draft-invoice-only party (the £9,792 QA case)', () => {
  const r = noCandidateReason({ paymentStatus: 'confirmed', unallocated: 9792, hasParty: true, candidateCount: 0 })
  assert.match(r ?? '', /must be issued/i)
})

test('no reason shown when candidates exist', () => {
  assert.equal(noCandidateReason({ paymentStatus: 'confirmed', unallocated: 100, hasParty: true, candidateCount: 2 }), null)
})

test('no reason shown when the payment is fully allocated', () => {
  assert.equal(noCandidateReason({ paymentStatus: 'confirmed', unallocated: 0, hasParty: true, candidateCount: 0 }), null)
})

// ── Reconciliation exceptions must agree with Operations ─────
test('flags confirmed payments that carry unallocated money', () => {
  const ex = unallocatedPaymentExceptions([
    { reference: 'FBA-PAY-2026-1C8AC49C', status: 'confirmed', amount: 1110, allocatedTotal: 0 },
    { reference: 'FBA-PAY-2026-2A3C7C0A', status: 'confirmed', amount: 9792, allocatedTotal: 0 },
  ])
  assert.equal(ex.length, 2, 'both QA payments are exceptions')
  assert.equal(ex[0].kind, 'payment_unallocated')
  assert.equal(ex[0].unallocated, 1110)
})

test('distinguishes part-allocated from wholly unallocated payments', () => {
  const ex = unallocatedPaymentExceptions([
    { reference: 'P-PART', status: 'confirmed', amount: 1000, allocatedTotal: 400 },
  ])
  assert.equal(ex.length, 1)
  assert.equal(ex[0].kind, 'payment_part_allocated')
  assert.equal(ex[0].unallocated, 600)
})

test('a fully allocated payment is not an exception', () => {
  assert.equal(unallocatedPaymentExceptions([
    { reference: 'P-DONE', status: 'confirmed', amount: 1110, allocatedTotal: 1110 },
  ]).length, 0)
})

test('pending and reversed payments are never exceptions', () => {
  assert.equal(unallocatedPaymentExceptions([
    { reference: 'P-PENDING', status: 'pending', amount: 500, allocatedTotal: 0 },
    { reference: 'P-REVERSED', status: 'reversed', amount: 1800, allocatedTotal: 0 },
  ]).length, 0)
})

test('sub-penny float dust does not raise a false exception', () => {
  assert.equal(unallocatedPaymentExceptions([
    { reference: 'P-DUST', status: 'confirmed', amount: 0.1 + 0.2, allocatedTotal: 0.3 },
  ]).length, 0)
})
