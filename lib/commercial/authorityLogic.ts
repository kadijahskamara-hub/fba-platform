// ============================================================
// Platform authority logic (Sprint 7 Part B) — pure functions.
//
// These mirror the SQL rules enforced by
// supabase/migrations/20260714_platform_authority_deletion.sql
// (set_ultra_admin / delete_user_account / the last-Ultra
// trigger) so every rule is unit-testable without a database.
// The API routes run these checks first for friendly errors;
// the SQL functions remain the atomic enforcement backstop.
//
// Pure module: no imports, importable from tests and any runtime.
// ============================================================

export interface AuthorityAccount {
  id: string
  email: string
  role: string          // 'admin' | 'staff' | 'trade_user' | 'trade_applicant' | 'retail_customer' | 'guest'
  status: string        // 'active' | 'suspended' | 'archived' | 'deleted' | …
  isUltraAdmin: boolean
}

export type AuthorityDecision =
  | { allowed: true }
  | { allowed: false; code: AuthorityRefusalCode; message: string }

export type AuthorityRefusalCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_TARGET'
  | 'SELF_REVOKE'
  | 'SELF_DELETE'
  | 'LAST_ULTRA_ADMIN'
  | 'ALREADY_DELETED'
  | 'REASON_REQUIRED'
  | 'CONFIRM_MISMATCH'
  | 'NO_CHANGE'

const refuse = (code: AuthorityRefusalCode, message: string): AuthorityDecision =>
  ({ allowed: false, code, message })

/** True when the actor may exercise Ultra-only powers at all. */
export function isActiveUltra(actor: Pick<AuthorityAccount, 'status' | 'isUltraAdmin'> | null | undefined): boolean {
  return Boolean(actor && actor.isUltraAdmin && actor.status === 'active')
}

/**
 * Would removing/demoting/deactivating `target` leave zero active
 * Ultra Admins? `activeUltraCount` counts ALL currently active
 * Ultra Admins including the target (as the DB trigger does).
 */
export function wouldLeaveNoUltra(
  target: Pick<AuthorityAccount, 'status' | 'isUltraAdmin'>,
  activeUltraCount: number,
): boolean {
  if (!target.isUltraAdmin || target.status !== 'active') return false
  return activeUltraCount - 1 <= 0
}

/** Mirror of set_ultra_admin(): may `actor` grant/revoke Ultra on `target`? */
export function canSetUltraAdmin(params: {
  actor: AuthorityAccount | null
  target: AuthorityAccount | null
  grant: boolean
  activeUltraCount: number
}): AuthorityDecision {
  const { actor, target, grant, activeUltraCount } = params
  if (!isActiveUltra(actor)) {
    return refuse('FORBIDDEN', 'Only an active Ultra Admin can grant or revoke platform authority')
  }
  if (!target) return refuse('NOT_FOUND', 'Target account does not exist')
  if (target.role !== 'admin') {
    return refuse('INVALID_TARGET', 'Ultra Admin authority can only be held by admin accounts')
  }
  if (target.status !== 'active') {
    return refuse('INVALID_TARGET', 'Target account is not active')
  }
  if (!grant && actor!.id === target.id) {
    return refuse('SELF_REVOKE', 'An Ultra Admin cannot revoke their own authority')
  }
  if (target.isUltraAdmin === grant) {
    return refuse('NO_CHANGE', grant ? 'Already an Ultra Admin' : 'Not currently an Ultra Admin')
  }
  if (!grant && wouldLeaveNoUltra(target, activeUltraCount)) {
    return refuse('LAST_ULTRA_ADMIN', 'The platform must always retain at least one active Ultra Admin')
  }
  return { allowed: true }
}

/** Mirror of delete_user_account(): may `actor` permanently delete `target`? */
export function canDeleteAccount(params: {
  actor: AuthorityAccount | null
  target: AuthorityAccount | null
  reason: string | null | undefined
  activeUltraCount: number
}): AuthorityDecision {
  const { actor, target, reason, activeUltraCount } = params
  if (!reason || reason.trim().length === 0) {
    return refuse('REASON_REQUIRED', 'A deletion reason must be provided')
  }
  if (!isActiveUltra(actor)) {
    return refuse('FORBIDDEN', 'Account deletion is an Ultra Admin power')
  }
  if (!target) return refuse('NOT_FOUND', 'Target account does not exist')
  if (actor!.id === target.id) {
    return refuse('SELF_DELETE', 'You cannot delete your own account')
  }
  if (target.status === 'deleted') {
    return refuse('ALREADY_DELETED', 'This account has already been deleted')
  }
  if (wouldLeaveNoUltra(target, activeUltraCount)) {
    return refuse('LAST_ULTRA_ADMIN', 'The platform must always retain at least one active Ultra Admin')
  }
  return { allowed: true }
}

/**
 * The typed-confirmation rule for the delete dialog/API: the caller
 * must retype the target's email exactly (case-insensitive, trimmed).
 */
export function validateDeleteConfirmation(params: {
  confirmEmail: string | null | undefined
  targetEmail: string
  reason: string | null | undefined
}): AuthorityDecision {
  const { confirmEmail, targetEmail, reason } = params
  if (!reason || reason.trim().length === 0) {
    return refuse('REASON_REQUIRED', 'A deletion reason must be provided')
  }
  const typed = (confirmEmail ?? '').trim().toLowerCase()
  if (typed.length === 0 || typed !== targetEmail.trim().toLowerCase()) {
    return refuse('CONFIRM_MISMATCH', 'Type the account email exactly to confirm deletion')
  }
  return { allowed: true }
}

// ── Anonymisation (mirror of the SQL UPDATE in delete_user_account) ──

export function anonymisedShortId(userId: string): string {
  return userId.replace(/-/g, '').slice(0, 12)
}

export function anonymisedEmail(userId: string): string {
  return `deleted-user-${anonymisedShortId(userId)}@removed.invalid`
}

// Type alias (not interface) so it satisfies Record<string, unknown>
// via TypeScript's implicit index signature for object literal types.
export type AnonymisedUserFields = {
  first_name: 'Deleted'
  last_name: 'User'
  email: string
  phone: null
  avatar_url: null
  must_change_password: false
  is_ultra_admin: false
  status: 'deleted'
}

/**
 * The exact field set the SQL function writes onto the users row
 * (minus password_hash, which is scrambled with a random value and
 * is deliberately not representable as a pure output). Used by
 * tests to assert the anonymised shape carries zero PII remnants.
 */
export function anonymisedUserFields(userId: string): AnonymisedUserFields {
  return {
    first_name: 'Deleted',
    last_name: 'User',
    email: anonymisedEmail(userId),
    phone: null,
    avatar_url: null,
    must_change_password: false,
    is_ultra_admin: false,
    status: 'deleted',
  }
}

/** PII field names that must never survive anonymisation with their old values. */
export const PII_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'avatar_url'] as const

/**
 * True when an anonymised row retains no PII from the original row.
 * (first_name/last_name are replaced with fixed placeholders; email
 * becomes the synthetic @removed.invalid address; phone/avatar null.)
 */
export function anonymisationIsClean(
  original: Record<string, unknown>,
  anonymised: Record<string, unknown>,
): boolean {
  for (const f of PII_FIELDS) {
    const before = original[f]
    const after = anonymised[f]
    if (before === null || before === undefined || before === '') continue
    if (after === before) return false
  }
  if (typeof anonymised.email !== 'string' || !/^deleted-user-[0-9a-f]{12}@removed\.invalid$/.test(anonymised.email)) {
    return false
  }
  return anonymised.status === 'deleted'
    && anonymised.phone == null
    && anonymised.avatar_url == null
    && anonymised.is_ultra_admin === false
}
