// ============================================================
// Sprint 18 accounting QA regression tests.
//
//  P1 — reversing a payment left sales_invoices.status = 'paid'
//       while amount_paid/balance_due were correctly restored.
//  P2 — un-allocating had no styled confirmation; a pending
//       payment's allocation panel gave no explanation.
//  New — stage/final invoice creation ignored the entered amount
//        and validated the FULL order total against the remaining
//        invoiceable balance, blocking every split-billing flow.
//  Gate — proformas.acceptance_status (default 'unknown', no UI)
//         blocked stage/final invoices even though the order itself
//         carries accepted_at from the existing acceptance flow.
//
// Node built-in test runner: npm test
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  deriveInvoiceStatus, applyAllocations, assertInvoiceable, remainingInvoiceable,
  stageFinalRequestedGross, acceptanceSatisfied, noCandidateReason,
} from '../lib/commercial/invoiceCalculations'

// ── P1: payment reversal must revert the invoice status ──────
test('reversal: paid invoice returns to issued when allocations drop to zero', () => {
  // £1,110 invoice fully paid…
  const paid = applyAllocations({ grossTotal: 1110, paymentAmount: 1110, toThisInvoice: [1110] })
  assert.equal(deriveInvoiceStatus({ grossTotal: 1110, amountPaid: paid.paid, creditTotal: 0, dueDate: null }), 'paid')

  // …then the payment is reversed: allocations are deleted, money is
  // restored, and the status must NOT stay 'paid'.
  const reversed = applyAllocations({ grossTotal: 1110, paymentAmount: 1110, toThisInvoice: [] })
  assert.equal(reversed.paid, 0)
  assert.equal(reversed.balanceDue, 1110)
  assert.equal(
    deriveInvoiceStatus({ grossTotal: 1110, amountPaid: 0, creditTotal: 0, dueDate: null }),
    'issued',
    'reversal must surface the invoice as outstanding again',
  )
})

test('reversal: past-due invoice returns to overdue, part-reversal to partially_paid', () => {
  assert.equal(
    deriveInvoiceStatus({ grossTotal: 1110, amountPaid: 0, creditTotal: 0, dueDate: '2026-01-01', today: '2026-07-18' }),
    'overdue',
  )
  assert.equal(
    deriveInvoiceStatus({ grossTotal: 1110, amountPaid: 500, creditTotal: 0, dueDate: null }),
    'partially_paid',
  )
})

test('reversal: the SQL recompute mirrors deriveInvoiceStatus (issued branch present)', () => {
  // The DB is authoritative at runtime; pin the migration so the SQL
  // cannot drift from the pure mirror again.
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260718_reversal_status_recompute.sql'), 'utf8')
  assert.match(sql, /when v_locked is not null then 'issued'/, 'issued fallback branch missing from recompute_invoice_financials')
  assert.match(sql, /create or replace function public\.recompute_invoice_financials/)
})

// ── New bug: stage/final validates the ENTERED amount ────────
test('QA repro: second stage invoice for the remaining £1,110 on a £2,220 order is allowed', () => {
  const orderGross = 2220
  const priorInvoiced = 1110 // first issued stage invoice
  const state = { orderGross, approvedVariations: 0, priorInvoiced, creditNotes: 0 }
  assert.equal(remainingInvoiceable(state), 1110)

  // The entered amount — not the full order total — is what must be guarded.
  const requested = stageFinalRequestedGross({ invoiceType: 'stage', stageAmount: 1110, priorInvoiced, remainingToInvoice: 1110 })
  assert.equal(requested, 1110)
  assert.equal(assertInvoiceable(requested!, state).ok, true, 'a partial second invoice must pass')

  // Sanity: the OLD behaviour (full order total) is exactly what QA saw rejected.
  const old = assertInvoiceable(orderGross, state)
  assert.equal(old.ok, false)
  assert.match(old.error ?? '', /2220\.00 exceeds the remaining invoiceable amount \(1110\.00\)/)
})

test('stage amount above the remaining balance is still rejected', () => {
  const state = { orderGross: 2220, approvedVariations: 0, priorInvoiced: 1110, creditNotes: 0 }
  assert.equal(assertInvoiceable(1110.01, state).ok, false)
})

test('final invoice defaults to the remaining balance once earlier invoices exist', () => {
  assert.equal(
    stageFinalRequestedGross({ invoiceType: 'final', stageAmount: null, priorInvoiced: 1110, remainingToInvoice: 1110 }),
    1110,
  )
  // First-ever final invoice: keep the itemized proforma lines (legacy behaviour).
  assert.equal(
    stageFinalRequestedGross({ invoiceType: 'final', stageAmount: null, priorInvoiced: 0, remainingToInvoice: 2220 }),
    null,
  )
})

test('stage without an entered amount keeps the itemized-lines path; other types unaffected', () => {
  assert.equal(stageFinalRequestedGross({ invoiceType: 'stage', stageAmount: null, priorInvoiced: 0, remainingToInvoice: 2220 }), null)
  assert.equal(stageFinalRequestedGross({ invoiceType: 'deposit', stageAmount: 500, priorInvoiced: 0, remainingToInvoice: 2220 }), null)
  assert.equal(stageFinalRequestedGross({ invoiceType: 'service', stageAmount: 500, priorInvoiced: 0, remainingToInvoice: 2220 }), null)
  // Entered amounts are normalised to 2dp minor units.
  assert.equal(stageFinalRequestedGross({ invoiceType: 'stage', stageAmount: 100.005, priorInvoiced: 0, remainingToInvoice: 2220 }), 100.01)
})

// ── Acceptance gate keys off either acceptance record ────────
test('order.accepted_at satisfies the stage/final acceptance gate', () => {
  // The QA data model note: every proforma sat at acceptance_status
  // 'unknown' (no UI sets it), while the conversion flow always stamps
  // commercial_orders.accepted_at — which must therefore count.
  assert.equal(acceptanceSatisfied({ invoiceType: 'stage', acceptanceStatus: 'unknown', orderAcceptedAt: '2026-07-01T10:00:00Z' }), true)
  assert.equal(acceptanceSatisfied({ invoiceType: 'final', acceptanceStatus: 'accepted', orderAcceptedAt: null }), true)
  assert.equal(acceptanceSatisfied({ invoiceType: 'final', acceptanceStatus: 'unknown', orderAcceptedAt: null }), false, 'no acceptance evidence anywhere still blocks')
  assert.equal(acceptanceSatisfied({ invoiceType: 'deposit', acceptanceStatus: 'unknown', orderAcceptedAt: null }), true, 'deposits were never gated')
})

// ── P2: pending-payment messaging + un-allocate confirmation ──
test('a pending payment explains why allocation is unavailable', () => {
  const reason = noCandidateReason({ paymentStatus: 'pending', unallocated: 500, hasParty: true, candidateCount: 3 })
  assert.match(reason ?? '', /pending/i)
  assert.match(reason ?? '', /Only confirmed payments can be allocated/)
})

test('PaymentActions renders the unavailability reason for non-confirmed payments and confirms un-allocation', () => {
  // UI-source guard: the QA defects were (a) the explanation box gated
  // behind status === 'confirmed', so pending payments showed nothing,
  // and (b) un-allocate firing with no styled confirmation.
  const src = readFileSync(join(process.cwd(), 'app/admin/payments/[id]/PaymentActions.tsx'), 'utf8')
  assert.doesNotMatch(src, /canAllocate && noCandidatesReason &&/, 'reason box must not be gated behind canAllocate')
  assert.match(src, /\{noCandidatesReason && \(/, 'reason box must render whenever there is a reason')
  assert.match(src, /appConfirm\(/, 'un-allocate must use the styled in-app confirmation')
  assert.match(src, /await appConfirm\(\s*`Remove the /, 'confirmation must precede the DELETE allocation call')
})
