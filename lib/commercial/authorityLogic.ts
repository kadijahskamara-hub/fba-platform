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

// ── Commercial data deletion (Sprint 7.1) ────────────────────

/** Record types deletable via delete_commercial_record(). */
export const DELETABLE_ENTITIES = [
  'proforma', 'commercial_order', 'sales_invoice', 'payment',
  'credit_note', 'refund', 'delivery', 'purchase_order',
  'retail_order', 'quote_request', 'custom_match',
  'trade_application', 'service_enquiry',
] as const

export type DeletableEntity = (typeof DELETABLE_ENTITIES)[number]

export function isDeletableEntity(value: unknown): value is DeletableEntity {
  return typeof value === 'string' && (DELETABLE_ENTITIES as readonly string[]).includes(value)
}

/** The exact phrase the purge dialog/API requires to be typed. */
export const PURGE_CONFIRM_PHRASE = 'PURGE ALL COMMERCIAL DATA'

export function validatePurgeRequest(params: {
  confirmPhrase: string | null | undefined
  reason: string | null | undefined
}): AuthorityDecision {
  if (!params.reason || params.reason.trim().length === 0) {
    return refuse('REASON_REQUIRED', 'A reason must be provided')
  }
  if ((params.confirmPhrase ?? '').trim() !== PURGE_CONFIRM_PHRASE) {
    return refuse('CONFIRM_MISMATCH', `Type "${PURGE_CONFIRM_PHRASE}" exactly to confirm`)
  }
  return { allowed: true }
}

// ── Sectioned data resets (Sprint 19) ────────────────────────

/**
 * Business sections purgeable via purge_platform_section().
 * Order matters for the UI: upstream sections that other data
 * depends on come later, mirroring the SQL BLOCKED pre-checks.
 */
export const PURGE_SECTIONS = [
  { key: 'communications',    label: 'Communications & documents', hint: 'Prepared comms packs, send events and generated document files.' },
  { key: 'accounting',        label: 'Accounting periods & exports', hint: 'Period locks and export runs. Removes period locks that block other resets.' },
  { key: 'finance',           label: 'Invoices, payments & credit notes', hint: 'All invoices, payments, receipts, allocations, credit notes and refunds.' },
  { key: 'deliveries',        label: 'Deliveries & installations', hint: 'Delivery notes, PODs, packages, exceptions, installations and site locations.' },
  { key: 'procurement',       label: 'Purchase orders', hint: 'Supplier POs and their snapshots; allocations return to “ready for PO”.' },
  { key: 'commercial_orders', label: 'Commercial orders (full chain)', hint: 'Every order plus its deliveries, POs, invoices, payments and comms.' },
  { key: 'quotes',            label: 'Quotes / proformas', hint: 'All quotes and issued documents. Purge Commercial orders first.' },
  { key: 'custom_match',      label: 'Custom Match requests', hint: 'All Custom Match requests and their attachments.' },
  { key: 'quote_requests',    label: 'Incoming quote requests', hint: 'The client-submitted request inbox (and request items).' },
  { key: 'retail_orders',     label: 'Retail orders', hint: 'All retail orders and their items.' },
  { key: 'service_enquiries', label: 'Service enquiries', hint: 'Website service/enquiry form submissions.' },
  { key: 'projects_carts',    label: 'Client projects & carts', hint: 'Client project boards and shopping carts. Purge Quote requests first.' },
  { key: 'trade_contacts',    label: 'Trade applications & contacts', hint: 'All trade account applications, contacts and contact notes.' },
  { key: 'customer_accounts', label: 'Customer accounts', hint: 'Non-staff user accounts. Purge Quote requests and Retail orders first.' },
] as const

export type PurgeSection = (typeof PURGE_SECTIONS)[number]['key']

export function isPurgeSection(value: unknown): value is PurgeSection {
  return typeof value === 'string' && PURGE_SECTIONS.some(s => s.key === value)
}

export function validateSectionPurgeRequest(params: {
  section: unknown
  reason: string | null | undefined
}): AuthorityDecision {
  if (!params.reason || params.reason.trim().length === 0) {
    return refuse('REASON_REQUIRED', 'A reason must be provided')
  }
  if (!isPurgeSection(params.section)) {
    return refuse('INVALID_TARGET', 'This is not a purgeable section')
  }
  return { allowed: true }
}

export function validateRecordDeletion(params: {
  entity: unknown
  reason: string | null | undefined
}): AuthorityDecision {
  if (!params.reason || params.reason.trim().length === 0) {
    return refuse('REASON_REQUIRED', 'A deletion reason must be provided')
  }
  if (!isDeletableEntity(params.entity)) {
    return refuse('INVALID_TARGET', 'This record type cannot be deleted')
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
