// ============================================================
// Credit-note lifecycle regression tests (Sprint 18, QA P0).
//
// QA found that a credit note could be drafted from an invoice but
// then became unreachable: no screen offered approve, issue,
// allocate or refund, and the parent invoice never listed it. The
// new screens drive their buttons from creditNoteAvailability();
// these tests pin the whole lifecycle, the segregation-of-duties
// rule, and the permission tiers so the actions cannot silently
// disappear again.
//
// Node built-in test runner: npm test
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creditNoteAvailability, creditNoteStage } from '../lib/commercial/creditNoteLogic'
import { checkCreditNoteAmount } from '../lib/commercial/invoiceCalculations'

const CREATOR = 'user-creator'
const APPROVER = 'user-approver'

/** A £300 draft credit note as created from the invoice detail page. */
function draft(overrides: Partial<Parameters<typeof creditNoteAvailability>[0]> = {}) {
  return creditNoteAvailability({
    status: 'draft', approvalStatus: 'required',
    grossTotal: 300, allocatedTotal: 0, hasAllocations: false, refundable: 0,
    createdBy: CREATOR, actorId: APPROVER,
    canApprovePermission: true, canCreatePermission: true, canRefundPermission: true,
    ...overrides,
  })
}

// ── End-to-end: draft → approve → issue → allocate ───────────
test('draft credit note offers approve (and void), nothing else', () => {
  const a = draft()
  assert.equal(a.canApprove, true, 'a second finance user can approve')
  assert.equal(a.canIssue, false, 'cannot issue before approval')
  assert.equal(a.canAllocate, false, 'cannot allocate before issue')
  assert.equal(a.canRefund, false, 'cannot refund before issue')
  assert.equal(a.canVoid, true, 'unallocated draft can be voided')
  assert.equal(creditNoteStage('draft', 'required'), 'draft — awaiting approval')
})

test('approved credit note becomes issuable', () => {
  const a = draft({ status: 'approved', approvalStatus: 'approved' })
  assert.equal(a.canApprove, false, 'already approved')
  assert.equal(a.canIssue, true)
  assert.equal(a.canAllocate, false, 'still not issued')
  assert.equal(creditNoteStage('approved', 'approved'), 'approved — ready to issue')
})

test('issued credit note allocates and refunds its unapplied value', () => {
  const a = draft({ status: 'issued', approvalStatus: 'approved', refundable: 300 })
  assert.equal(a.canApprove, false)
  assert.equal(a.canIssue, false, 'already issued (immutable)')
  assert.equal(a.canAllocate, true)
  assert.equal(a.available, 300)
  assert.equal(a.canRefund, true)
  assert.equal(a.canVoid, true, 'voidable until an allocation exists')
})

test('fully allocated credit note offers nothing destructive', () => {
  const a = draft({ status: 'allocated', approvalStatus: 'approved', allocatedTotal: 300, hasAllocations: true, refundable: 0 })
  assert.equal(a.canAllocate, false, 'nothing left to allocate')
  assert.equal(a.available, 0)
  assert.equal(a.canRefund, false, 'nothing left to refund')
  assert.equal(a.canVoid, false, 'allocations block voiding')
})

test('partially allocated credit note can allocate/refund the remainder but never void', () => {
  const a = draft({ status: 'issued', approvalStatus: 'approved', allocatedTotal: 120, hasAllocations: true, refundable: 180 })
  assert.equal(a.available, 180)
  assert.equal(a.canAllocate, true)
  assert.equal(a.canRefund, true)
  assert.equal(a.canVoid, false)
})

test('void credit note is inert', () => {
  const a = draft({ status: 'void', approvalStatus: 'required' })
  assert.equal(a.canApprove, false)
  assert.equal(a.canIssue, false)
  assert.equal(a.canAllocate, false)
  assert.equal(a.canRefund, false)
  assert.equal(a.canVoid, false)
  assert.equal(creditNoteStage('void', 'required'), 'void')
})

// ── Segregation of duties & permission tiers ─────────────────
test('the creator cannot approve their own credit note', () => {
  const a = draft({ actorId: CREATOR })
  assert.equal(a.canApprove, false)
  assert.match(a.approveBlockedReason ?? '', /Segregation of duties/)
})

test('approve/issue/allocate require the credit_note_approve permission tier', () => {
  const noPerm = draft({ canApprovePermission: false })
  assert.equal(noPerm.canApprove, false)
  assert.match(noPerm.approveBlockedReason ?? '', /credit_note_approve/)
  assert.equal(draft({ status: 'approved', approvalStatus: 'approved', canApprovePermission: false }).canIssue, false)
  assert.equal(draft({ status: 'issued', approvalStatus: 'approved', canApprovePermission: false }).canAllocate, false)
})

test('refund requires refund_record; void requires credit_note_create', () => {
  assert.equal(draft({ status: 'issued', approvalStatus: 'approved', refundable: 300, canRefundPermission: false }).canRefund, false)
  assert.equal(draft({ canCreatePermission: false }).canVoid, false)
})

// ── Amount guard (unchanged Sprint 3 rule, pinned here) ──────
test('credit note gross cannot exceed the eligible invoice value', () => {
  assert.equal(checkCreditNoteAmount({ creditNoteGross: 300, eligibleInvoiceAmount: 300 }).ok, true)
  const over = checkCreditNoteAmount({ creditNoteGross: 300.01, eligibleInvoiceAmount: 300 })
  assert.equal(over.ok, false)
})
