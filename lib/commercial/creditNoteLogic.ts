// ============================================================
// Credit-note lifecycle availability (Sprint 18, QA P0).
//
// The full server machinery for credit notes has existed since
// Sprint 3/6 (create → approve → issue → allocate/refund → void),
// but no admin screen exposed it, so a drafted credit note was
// unreachable after the page reloaded. This pure module mirrors the
// server-side rules exactly and decides which actions the new
// credit-note screens may offer. It is intentionally free of
// 'server-only' imports so both the UI and the node:test regression
// suite can use it.
//
// Server rules mirrored here:
//  • approve  — lib/commercial/creditNotes.ts approveCreditNote():
//               not yet issued, approval outstanding, and NOT the
//               creator (segregation of duties). Permission:
//               credit_note_approve (Ultra-tier, grantable to staff).
//  • issue    — SQL issue_credit_note(): requires approval first.
//               Permission: credit_note_approve.
//  • allocate — SQL allocate_credit_note(): only an issued note with
//               unallocated value left. Permission: credit_note_approve.
//  • refund   — record_refund(): issued note, refundable balance
//               (gross − allocated − live refunds). Permission:
//               refund_record (approval itself stays Ultra-only).
//  • void     — voidCreditNote(): never after allocation.
//               Permission: credit_note_create.
// ============================================================

export interface CreditNoteAvailabilityInput {
  status: string                 // draft | pending_approval | approved | issued | allocated | void
  approvalStatus: string         // none | required | approved
  grossTotal: number
  allocatedTotal: number
  hasAllocations: boolean
  refundable: number             // gross − allocated − non-cancelled refunds
  createdBy: string | null
  actorId: string
  canApprovePermission: boolean  // credit_note_approve
  canCreatePermission: boolean   // credit_note_create
  canRefundPermission: boolean   // refund_record
}

export interface CreditNoteAvailability {
  canApprove: boolean
  canIssue: boolean
  canAllocate: boolean
  canRefund: boolean
  canVoid: boolean
  /** Unallocated value left on an issued note. */
  available: number
  /** Why approve is unavailable when the note still needs it. */
  approveBlockedReason: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function creditNoteAvailability(p: CreditNoteAvailabilityInput): CreditNoteAvailability {
  const issued = p.status === 'issued' || p.status === 'allocated'
  const voided = p.status === 'void'
  const available = issued ? Math.max(0, round2(p.grossTotal - p.allocatedTotal)) : 0

  const needsApproval = !issued && !voided && p.approvalStatus !== 'approved'
  const selfApproval = p.createdBy != null && p.createdBy === p.actorId

  let approveBlockedReason: string | null = null
  if (needsApproval) {
    if (!p.canApprovePermission) {
      approveBlockedReason = 'Approval requires the credit_note_approve permission (Ultra Admin, or a staff member it has been granted to).'
    } else if (selfApproval) {
      approveBlockedReason = 'Segregation of duties: you cannot approve a credit note you created.'
    }
  }

  return {
    canApprove: needsApproval && p.canApprovePermission && !selfApproval,
    canIssue: !issued && !voided && p.approvalStatus === 'approved' && p.canApprovePermission,
    canAllocate: issued && available > 0.005 && p.canApprovePermission,
    canRefund: issued && p.refundable > 0.005 && p.canRefundPermission,
    canVoid: !voided && !p.hasAllocations && round2(p.allocatedTotal) <= 0 && p.canCreatePermission,
    available,
    approveBlockedReason,
  }
}

/** Lifecycle stage label for list/detail status pills. */
export function creditNoteStage(status: string, approvalStatus: string): string {
  if (status === 'void') return 'void'
  if (status === 'allocated') return 'allocated'
  if (status === 'issued') return 'issued'
  if (approvalStatus === 'approved') return 'approved — ready to issue'
  return 'draft — awaiting approval'
}
