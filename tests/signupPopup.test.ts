import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SIGNUP_POPUP, normalizeSignupPopupConfig, isPopupActive,
  isSuppressed, isPopupAudience, isValidPopupEmail,
} from '../lib/signupPopup'

// ============================================================
// Signup popup config (Sprint 25)
// ============================================================

test('defaults: disabled, retail+trade audiences, sane trigger', () => {
  assert.equal(DEFAULT_SIGNUP_POPUP.enabled, false)
  assert.deepEqual(DEFAULT_SIGNUP_POPUP.audiences.map(a => a.key), ['retail', 'trade'])
  assert.equal(DEFAULT_SIGNUP_POPUP.trigger, 'delay')
})

test('normalize: junk input falls back to defaults entirely', () => {
  for (const junk of [null, undefined, 'x', 42, []]) {
    const c = normalizeSignupPopupConfig(junk)
    assert.equal(c.enabled, false)
    assert.equal(c.headline, DEFAULT_SIGNUP_POPUP.headline)
    assert.deepEqual(c.audiences.map(a => a.key), ['retail', 'trade'])
  }
})

test('normalize: partial config merges over defaults, fields clamped', () => {
  const c = normalizeSignupPopupConfig({
    enabled: true, headline: 'Join The Family', delaySeconds: 9999,
    scrollPercent: 1, suppressDays: -5, trigger: 'bogus',
    audiences: [{ key: 'retail', label: 'RETAIL' }, { key: 'trade', label: 'TRADE' }],
  })
  assert.equal(c.enabled, true)
  assert.equal(c.headline, 'Join The Family')
  assert.equal(c.delaySeconds, 120)          // clamped to max
  assert.equal(c.scrollPercent, 5)           // clamped to min
  assert.equal(c.suppressDays, 0)            // clamped to min
  assert.equal(c.trigger, 'delay')           // unknown trigger → default
  assert.deepEqual(c.audiences.map(a => a.label), ['RETAIL', 'TRADE'])
  assert.equal(c.buttonLabel, DEFAULT_SIGNUP_POPUP.buttonLabel) // untouched default
})

test('normalize: audiences are always exactly retail + trade in order', () => {
  const c = normalizeSignupPopupConfig({ audiences: [{ key: 'trade', label: 'Pro' }, { key: 'evil', label: 'X' }] })
  assert.deepEqual(c.audiences.map(a => a.key), ['retail', 'trade'])
  assert.equal(c.audiences[1].label, 'Pro')
  assert.equal(c.audiences[0].label, 'Retail') // missing retail falls back
})

test('isPopupActive honours enabled flag and schedule window', () => {
  const base = normalizeSignupPopupConfig({ enabled: true })
  const now = new Date('2026-07-20T12:00:00Z')
  assert.equal(isPopupActive(base, now), true)
  assert.equal(isPopupActive({ ...base, enabled: false }, now), false)
  assert.equal(isPopupActive({ ...base, startsAt: '2026-08-01' }, now), false) // not started
  assert.equal(isPopupActive({ ...base, endsAt: '2026-07-01' }, now), false)   // ended
  assert.equal(isPopupActive({ ...base, startsAt: '2026-07-01', endsAt: '2026-08-01' }, now), true)
  assert.equal(isPopupActive({ ...base, startsAt: 'garbage' }, now), true)     // bad date ignored
})

test('isSuppressed: inside the snooze window only', () => {
  const c = normalizeSignupPopupConfig({ enabled: true, suppressDays: 14 })
  const now = new Date('2026-07-20T12:00:00Z')
  assert.equal(isSuppressed(c, null, now), false)
  assert.equal(isSuppressed(c, '2026-07-15T12:00:00Z', now), true)   // 5 days ago
  assert.equal(isSuppressed(c, '2026-07-01T12:00:00Z', now), false)  // 19 days ago
  assert.equal(isSuppressed(c, 'not-a-date', now), false)
  const never = normalizeSignupPopupConfig({ enabled: true, suppressDays: 0 })
  assert.equal(isSuppressed(never, '2026-07-20T11:59:00Z', now), false) // 0 = no snooze
})

test('audience + email validation', () => {
  assert.equal(isPopupAudience('retail'), true)
  assert.equal(isPopupAudience('trade'), true)
  assert.equal(isPopupAudience('professional'), false)
  assert.equal(isPopupAudience(''), false)
  assert.equal(isValidPopupEmail('a@b.co'), true)
  assert.equal(isValidPopupEmail('  a@b.co '), true)   // trimmed
  assert.equal(isValidPopupEmail('nope'), false)
  assert.equal(isValidPopupEmail('a@b'), false)
  assert.equal(isValidPopupEmail('a b@c.com'), false)
  assert.equal(isValidPopupEmail(42), false)
  assert.equal(isValidPopupEmail('a@' + 'b'.repeat(260) + '.com'), false) // length cap
})
