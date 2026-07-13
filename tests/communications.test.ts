// ============================================================
// Communications + documents logic tests (Sprint 5).
// Node built-in test runner: npm test
// Covers: template rendering (injection-safe), variable extraction,
// the pack state machine, attachment-scope validation, recipient
// normalisation, and the delivery-note no-price guard applied to a
// delivery-note-shaped snapshot.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  renderTemplate, renderTemplateString, extractVariables, sanitizeValue,
  canApplyEvent, canEditPack, isOutstanding, validateAttachmentScope,
  validEmails, normalizeRecipients,
  PACK_STATUSES, type PackStatus,
} from '../lib/commercial/communications'
import { findForbiddenDeliveryFields } from '../lib/commercial/deliveryLogic'

// ── Template rendering ──────────────────────────────────────

test('renderTemplate substitutes known variables', () => {
  const r = renderTemplate(
    'Invoice {{document_number}}',
    'Dear {{client_name}}, balance {{balance_due}}.',
    { document_number: 'FBA-INV-2026-0007', client_name: 'Ms Client', balance_due: '£4,200.00' },
  )
  assert.equal(r.subject, 'Invoice FBA-INV-2026-0007')
  assert.equal(r.body, 'Dear Ms Client, balance £4,200.00.')
  assert.deepEqual(r.missing, [])
})

test('missing variables are reported and rendered blank', () => {
  const r = renderTemplate('Hi {{recipient_name}}', 'Ref {{document_number}} due {{due_date}}', { document_number: 'X' })
  assert.equal(r.body, 'Ref X due ')
  assert.deepEqual([...r.missing].sort(), ['due_date', 'recipient_name'])
})

test('subject whitespace is collapsed and trimmed', () => {
  const r = renderTemplate('  A   {{x}}  ', 'body', { x: 'B' })
  assert.equal(r.subject, 'A B')
})

test('a variable value cannot inject a NEW placeholder (single-pass, braces stripped)', () => {
  const r = renderTemplateString('Hello {{name}}', { name: '{{secret}}', secret: 'LEAK' })
  // The injected {{secret}} must NOT be expanded; braces are stripped from the value.
  assert.equal(r.text, 'Hello secret')
  assert.ok(!r.text.includes('LEAK'))
})

test('sanitizeValue strips control chars but keeps tab and newline', () => {
  const v = sanitizeValue('ab\tc\nd')
  assert.equal(v, 'ab\tc\nd')
})

test('extractVariables returns unique keys (case-insensitive)', () => {
  assert.deepEqual(extractVariables('{{a}} {{b}} {{a}} {{ c }}').sort(), ['a', 'b', 'c'])
})

// ── Pack state machine ──────────────────────────────────────

test('prepared can be downloaded, sent, or flagged; not re_prepared', () => {
  assert.equal(canApplyEvent('prepared', 'downloaded'), true)
  assert.equal(canApplyEvent('prepared', 'marked_sent'), true)
  assert.equal(canApplyEvent('prepared', 'needs_attention'), true)
  assert.equal(canApplyEvent('prepared', 're_prepared'), false)
})

test('superseded packs accept no further events', () => {
  for (const ev of ['downloaded', 'marked_sent', 'needs_attention', 're_prepared', 'edited'] as const) {
    assert.equal(canApplyEvent('superseded', ev), false, `superseded + ${ev}`)
  }
})

test('needs_attention and marked_sent can be re_prepared', () => {
  assert.equal(canApplyEvent('needs_attention', 're_prepared'), true)
  assert.equal(canApplyEvent('marked_sent', 're_prepared'), true)
})

test('edits are only allowed while prepared', () => {
  assert.equal(canEditPack('prepared'), true)
  for (const s of PACK_STATUSES.filter(x => x !== 'prepared') as PackStatus[]) {
    assert.equal(canEditPack(s), false, `canEditPack(${s})`)
  }
})

test('outstanding = prepared | downloaded | needs_attention', () => {
  assert.equal(isOutstanding('prepared'), true)
  assert.equal(isOutstanding('downloaded'), true)
  assert.equal(isOutstanding('needs_attention'), true)
  assert.equal(isOutstanding('marked_sent'), false)
  assert.equal(isOutstanding('superseded'), false)
})

// ── Attachment-scope validation (no cross-order attachments) ─

test('attachments outside the allowed set are rejected', () => {
  const res = validateAttachmentScope(['a', 'b', 'x'], ['a', 'b', 'c'])
  assert.equal(res.ok, false)
  assert.deepEqual(res.invalid, ['x'])
  assert.deepEqual(res.accepted, ['a', 'b'])
})

test('a fully in-scope attachment list is accepted', () => {
  const res = validateAttachmentScope(['a', 'c'], ['a', 'b', 'c'])
  assert.equal(res.ok, true)
  assert.deepEqual(res.invalid, [])
})

// ── Recipients ──────────────────────────────────────────────

test('validEmails filters invalid and de-duplicates', () => {
  assert.deepEqual(validEmails(['a@b.com', 'nope', 'a@b.com', '', null, 'c@d.co']), ['a@b.com', 'c@d.co'])
})

test('normalizeRecipients coerces shape and validates', () => {
  const r = normalizeRecipients({ to: ['a@b.com', 'bad'], cc: ['c@d.com'], names: { 'a@b.com': 'A' } })
  assert.deepEqual(r.to, ['a@b.com'])
  assert.deepEqual(r.cc, ['c@d.com'])
  assert.equal(r.names['a@b.com'], 'A')
})

// ── Delivery-note no-price guard on a delivery-note snapshot ─

test('a clean delivery-note snapshot has no forbidden fields', () => {
  const snap = {
    docType: 'delivery_note', deliveryNumber: 'FBA-DEL-2026-0001',
    lines: [{ name: 'Oak table', quantity: 1, ordered_quantity: 2, unit_of_measure: 'each' }],
    packages: [{ reference: 'PKG1', weight: '30kg' }],
  }
  assert.deepEqual(findForbiddenDeliveryFields(snap), [])
})

test('an injected price/total field is caught by the guard', () => {
  const snap = {
    docType: 'delivery_note', deliveryNumber: 'FBA-DEL-2026-0002',
    lines: [{ name: 'Oak table', quantity: 1, unit_price: 900, line_gross_total: 1080 }],
  }
  const hits = findForbiddenDeliveryFields(snap)
  assert.ok(hits.some(h => h.includes('unit_price')))
  assert.ok(hits.some(h => h.includes('line_gross_total')))
})
