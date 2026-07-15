// ============================================================
// Platform authority tests (Sprint 7 Part B). Node test runner.
// Covers §B.5.2: last-Ultra protection (revoke AND delete paths),
// self-deletion refusal, self-revoke refusal, non-Ultra attempts,
// anonymisation output shape (no PII remnants), reason required,
// and the typed-confirmation rule. These pure functions mirror
// the SQL enforcement in 20260714_platform_authority_deletion.sql,
// which was additionally exercised against the live DB (see the
// Sprint 7 handback, Part B verification).
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canSetUltraAdmin, canDeleteAccount, validateDeleteConfirmation,
  isActiveUltra, wouldLeaveNoUltra,
  anonymisedShortId, anonymisedEmail, anonymisedUserFields, anonymisationIsClean,
  DELETABLE_ENTITIES, isDeletableEntity, PURGE_CONFIRM_PHRASE,
  validatePurgeRequest, validateRecordDeletion,
  type AuthorityAccount,
} from '../lib/commercial/authorityLogic'

const kadijahta: AuthorityAccount = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'info@fullbloom.uk.com',
  role: 'admin', status: 'active', isUltraAdmin: true,
}
const admin2: AuthorityAccount = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'second@fullbloom.uk.com',
  role: 'admin', status: 'active', isUltraAdmin: false,
}
const staff: AuthorityAccount = {
  id: '33333333-3333-3333-3333-333333333333',
  email: 'staff@fullbloom.uk.com',
  role: 'staff', status: 'active', isUltraAdmin: false,
}
const trade: AuthorityAccount = {
  id: '44444444-4444-4444-4444-444444444444',
  email: 'trade@example.com',
  role: 'trade_user', status: 'active', isUltraAdmin: false,
}
const client: AuthorityAccount = {
  id: '55555555-5555-5555-5555-555555555555',
  email: 'client@example.com',
  role: 'retail_customer', status: 'active', isUltraAdmin: false,
}

const ultra = (a: AuthorityAccount): AuthorityAccount => ({ ...a, isUltraAdmin: true })

// ── isActiveUltra / wouldLeaveNoUltra ────────────────────────

test('isActiveUltra requires both the flag and active status', () => {
  assert.equal(isActiveUltra(kadijahta), true)
  assert.equal(isActiveUltra(admin2), false)
  assert.equal(isActiveUltra({ ...kadijahta, status: 'suspended' }), false)
  assert.equal(isActiveUltra({ ...kadijahta, status: 'archived' }), false)
  assert.equal(isActiveUltra(null), false)
})

test('wouldLeaveNoUltra only fires for the last active Ultra', () => {
  assert.equal(wouldLeaveNoUltra(kadijahta, 1), true)
  assert.equal(wouldLeaveNoUltra(kadijahta, 2), false)
  assert.equal(wouldLeaveNoUltra(admin2, 1), false)          // target not ultra
  assert.equal(wouldLeaveNoUltra({ ...kadijahta, status: 'suspended' }, 1), false)
})

// ── Appointment (grant/revoke) ───────────────────────────────

test('an active Ultra can grant Ultra to another active admin', () => {
  const d = canSetUltraAdmin({ actor: kadijahta, target: admin2, grant: true, activeUltraCount: 1 })
  assert.deepEqual(d, { allowed: true })
})

test('non-Ultra actors cannot grant or revoke', () => {
  for (const actor of [admin2, staff, null]) {
    const d = canSetUltraAdmin({ actor, target: admin2, grant: true, activeUltraCount: 1 })
    assert.equal(d.allowed, false)
    assert.equal(!d.allowed && d.code, 'FORBIDDEN')
  }
})

test('Ultra authority is admin-only and active-only', () => {
  const d1 = canSetUltraAdmin({ actor: kadijahta, target: staff, grant: true, activeUltraCount: 1 })
  assert.equal(!d1.allowed && d1.code, 'INVALID_TARGET')
  const d2 = canSetUltraAdmin({ actor: kadijahta, target: { ...admin2, status: 'suspended' }, grant: true, activeUltraCount: 1 })
  assert.equal(!d2.allowed && d2.code, 'INVALID_TARGET')
  const d3 = canSetUltraAdmin({ actor: kadijahta, target: null, grant: true, activeUltraCount: 1 })
  assert.equal(!d3.allowed && d3.code, 'NOT_FOUND')
})

test('self-revoke is refused', () => {
  const d = canSetUltraAdmin({ actor: kadijahta, target: kadijahta, grant: false, activeUltraCount: 2 })
  assert.equal(!d.allowed && d.code, 'SELF_REVOKE')
})

test('B.5.3: second Ultra may revoke the first ONLY while another active Ultra remains', () => {
  // Two active Ultras: second revokes the first — allowed.
  const ok = canSetUltraAdmin({ actor: ultra(admin2), target: kadijahta, grant: false, activeUltraCount: 2 })
  assert.deepEqual(ok, { allowed: true })
  // Target is the last active Ultra — refused (revoke path).
  const bad = canSetUltraAdmin({ actor: ultra({ ...admin2, status: 'active' }), target: kadijahta, grant: false, activeUltraCount: 1 })
  assert.equal(!bad.allowed && bad.code, 'LAST_ULTRA_ADMIN')
})

test('granting to an existing Ultra / revoking a non-Ultra is a no-change refusal', () => {
  const d1 = canSetUltraAdmin({ actor: kadijahta, target: ultra(admin2), grant: true, activeUltraCount: 2 })
  assert.equal(!d1.allowed && d1.code, 'NO_CHANGE')
  const d2 = canSetUltraAdmin({ actor: kadijahta, target: admin2, grant: false, activeUltraCount: 1 })
  assert.equal(!d2.allowed && d2.code, 'NO_CHANGE')
})

// ── Deletion ─────────────────────────────────────────────────

test('reason is required before anything else', () => {
  for (const reason of [null, undefined, '', '   ']) {
    const d = canDeleteAccount({ actor: kadijahta, target: client, reason, activeUltraCount: 1 })
    assert.equal(!d.allowed && d.code, 'REASON_REQUIRED')
  }
})

test('non-Ultra delete attempts are refused (audited as security events by the API)', () => {
  for (const actor of [admin2, staff, null, { ...kadijahta, status: 'suspended' }]) {
    const d = canDeleteAccount({ actor, target: client, reason: 'gdpr', activeUltraCount: 1 })
    assert.equal(!d.allowed && d.code, 'FORBIDDEN')
  }
})

test('self-deletion is refused', () => {
  const d = canDeleteAccount({ actor: kadijahta, target: kadijahta, reason: 'oops', activeUltraCount: 2 })
  assert.equal(!d.allowed && d.code, 'SELF_DELETE')
})

test('deleting an already-deleted account is refused', () => {
  const d = canDeleteAccount({ actor: kadijahta, target: { ...client, status: 'deleted' }, reason: 'again', activeUltraCount: 1 })
  assert.equal(!d.allowed && d.code, 'ALREADY_DELETED')
})

test('B.5.2: last-Ultra protection on the DELETE path', () => {
  // Deleting the last active Ultra is refused …
  const bad = canDeleteAccount({ actor: ultra(admin2), target: kadijahta, reason: 'x', activeUltraCount: 1 })
  assert.equal(!bad.allowed && bad.code, 'LAST_ULTRA_ADMIN')
  // … but allowed while another active Ultra remains.
  const ok = canDeleteAccount({ actor: ultra(admin2), target: kadijahta, reason: 'x', activeUltraCount: 2 })
  assert.deepEqual(ok, { allowed: true })
})

test('every account type is deletable by an Ultra (admin, staff, trade, client)', () => {
  for (const target of [admin2, staff, trade, client]) {
    const d = canDeleteAccount({ actor: kadijahta, target, reason: 'closure', activeUltraCount: 1 })
    assert.deepEqual(d, { allowed: true }, `expected ${target.role} to be deletable`)
  }
})

// ── Typed confirmation ───────────────────────────────────────

test('typed confirmation must match the target email (case-insensitive, trimmed)', () => {
  const ok = validateDeleteConfirmation({ confirmEmail: '  Client@Example.com ', targetEmail: 'client@example.com', reason: 'closure' })
  assert.deepEqual(ok, { allowed: true })
  const miss = validateDeleteConfirmation({ confirmEmail: 'wrong@example.com', targetEmail: 'client@example.com', reason: 'closure' })
  assert.equal(!miss.allowed && miss.code, 'CONFIRM_MISMATCH')
  const empty = validateDeleteConfirmation({ confirmEmail: '', targetEmail: 'client@example.com', reason: 'closure' })
  assert.equal(!empty.allowed && empty.code, 'CONFIRM_MISMATCH')
  const noReason = validateDeleteConfirmation({ confirmEmail: 'client@example.com', targetEmail: 'client@example.com', reason: '' })
  assert.equal(!noReason.allowed && noReason.code, 'REASON_REQUIRED')
})

// ── Anonymisation shape (B.5.2) ──────────────────────────────

test('anonymised email is deterministic and PII-free', () => {
  const id = 'bd59cca9-8fa3-4112-a959-3c2da7b00176'
  assert.equal(anonymisedShortId(id), 'bd59cca98fa3')
  assert.equal(anonymisedEmail(id), 'deleted-user-bd59cca98fa3@removed.invalid')
})

test('anonymisedUserFields carries zero PII remnants', () => {
  const original = {
    first_name: 'Kadi', last_name: 'Test', email: 'kadi@example.com',
    phone: '+44 7000 000000', avatar_url: 'https://cdn/x.jpg',
    status: 'active', is_ultra_admin: true, must_change_password: true,
  }
  const anon = anonymisedUserFields(client.id)
  assert.equal(anonymisationIsClean(original, anon), true)
  assert.equal(anon.status, 'deleted')
  assert.equal(anon.is_ultra_admin, false)
  assert.equal(anon.phone, null)
  assert.equal(anon.avatar_url, null)
  assert.match(anon.email, /^deleted-user-[0-9a-f]{12}@removed\.invalid$/)
})

test('anonymisationIsClean detects PII leaks', () => {
  const original = { first_name: 'Kadi', last_name: 'Test', email: 'kadi@example.com', phone: '070', avatar_url: null }
  // Leaked email
  assert.equal(anonymisationIsClean(original, { ...anonymisedUserFields(client.id), email: 'kadi@example.com' }), false)
  // Leaked phone
  assert.equal(anonymisationIsClean(original, { ...anonymisedUserFields(client.id), phone: '070' }), false)
  // Wrong status
  assert.equal(anonymisationIsClean(original, { ...anonymisedUserFields(client.id), status: 'archived' }), false)
})

// ── Commercial data deletion (Sprint 7.1) ────────────────────

test('deletable entity allowlist is exact', () => {
  for (const e of DELETABLE_ENTITIES) assert.equal(isDeletableEntity(e), true)
  assert.equal(isDeletableEntity('user'), false)
  assert.equal(isDeletableEntity('audit_log'), false)
  assert.equal(isDeletableEntity(''), false)
  assert.equal(isDeletableEntity(null), false)
  assert.equal(isDeletableEntity(42), false)
})

test('purge requires the exact phrase AND a reason', () => {
  const ok = validatePurgeRequest({ confirmPhrase: `  ${PURGE_CONFIRM_PHRASE}  `, reason: 'pre-launch reset' })
  assert.deepEqual(ok, { allowed: true })

  const wrongPhrase = validatePurgeRequest({ confirmPhrase: 'purge all commercial data', reason: 'x' })
  assert.equal(!wrongPhrase.allowed && wrongPhrase.code, 'CONFIRM_MISMATCH') // case-sensitive on purpose

  const noPhrase = validatePurgeRequest({ confirmPhrase: '', reason: 'x' })
  assert.equal(!noPhrase.allowed && noPhrase.code, 'CONFIRM_MISMATCH')

  const noReason = validatePurgeRequest({ confirmPhrase: PURGE_CONFIRM_PHRASE, reason: '  ' })
  assert.equal(!noReason.allowed && noReason.code, 'REASON_REQUIRED')
})

test('record deletion requires a known entity and a reason', () => {
  assert.deepEqual(validateRecordDeletion({ entity: 'commercial_order', reason: 'test order' }), { allowed: true })
  const badEntity = validateRecordDeletion({ entity: 'user', reason: 'x' })
  assert.equal(!badEntity.allowed && badEntity.code, 'INVALID_TARGET')
  const noReason = validateRecordDeletion({ entity: 'payment', reason: '' })
  assert.equal(!noReason.allowed && noReason.code, 'REASON_REQUIRED')
})
