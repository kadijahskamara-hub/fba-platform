// ============================================================
// Sprint 17 — finish-selection routing and attachment error
// mapping. Guards two QA defects:
//   * admin quote line Fabric/Upholstery + Full Specification
//     rendered blank because every group was flattened into
//     selected_finish;
//   * Custom Match uploads reported "0 attached, 1 failed" with
//     no reason, because the storage error was discarded.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitFinishSelections, isSoftFinishGroup } from '../lib/commercial/finishSelections'
import { attachmentUploadError } from '../lib/customMatch/logic'

test('soft finish groups are recognised by label', () => {
  for (const l of ['Upholstery fabric', 'Seat Fabric', 'Leather grade', 'Textile', 'Cushion weave']) {
    assert.equal(isSoftFinishGroup(l), true, l)
  }
  for (const l of ['Frame timber', 'Leg finish', 'Metalwork', 'Stone top']) {
    assert.equal(isSoftFinishGroup(l), false, l)
  }
})

test('hard and soft selections route to separate fields', () => {
  const r = splitFinishSelections([
    { groupLabel: 'Frame timber', finishLabel: 'European Oak' },
    { groupLabel: 'Upholstery fabric', finishLabel: 'FR Linen 04' },
    { groupLabel: 'Leg finish', finishLabel: 'Antique Brass' },
  ])
  assert.equal(r.selectedFinish, 'Frame timber: European Oak; Leg finish: Antique Brass')
  assert.equal(r.selectedFabric, 'Upholstery fabric: FR Linen 04')
  assert.equal(r.specDetails, 'Frame timber: European Oak\nUpholstery fabric: FR Linen 04\nLeg finish: Antique Brass')
})

test('a hard-only configuration leaves fabric null, not empty string', () => {
  const r = splitFinishSelections([{ groupLabel: 'Frame timber', finishLabel: 'Walnut' }])
  assert.equal(r.selectedFabric, null)
  assert.equal(r.selectedFinish, 'Frame timber: Walnut')
  assert.equal(r.specDetails, 'Frame timber: Walnut')
})

test('a fabric-only configuration leaves finish null', () => {
  const r = splitFinishSelections([{ groupLabel: 'Seat fabric', finishLabel: 'Bouclé 12' }])
  assert.equal(r.selectedFinish, null)
  assert.equal(r.selectedFabric, 'Seat fabric: Bouclé 12')
})

test('no selections yields all nulls', () => {
  const r = splitFinishSelections([])
  assert.deepEqual(r, { selectedFinish: null, selectedFabric: null, specDetails: null })
})

test('malformed selections are dropped rather than rendered as blanks', () => {
  const r = splitFinishSelections([
    { groupLabel: 'Frame timber', finishLabel: 'Oak' },
    { groupLabel: '', finishLabel: 'orphan' },
    { groupLabel: 'Leg finish', finishLabel: '' },
  ] as Array<{ groupLabel: string; finishLabel: string }>)
  assert.equal(r.selectedFinish, 'Frame timber: Oak')
  assert.equal(r.specDetails, 'Frame timber: Oak')
})

test('long configurations are capped within column limits', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ groupLabel: `Group ${i}`, finishLabel: `Finish ${i}` }))
  const r = splitFinishSelections(many)
  assert.ok((r.selectedFinish ?? '').length <= 490)
  assert.ok((r.specDetails ?? '').length <= 700)
})

// ── Attachment error mapping ─────────────────────────────────
test('storage errors map to actionable client messages', () => {
  assert.match(attachmentUploadError('Bucket not found'), /not configured/i)
  assert.match(attachmentUploadError('new row violates row-level security policy'), /not permitted/i)
  assert.match(attachmentUploadError('The object exceeded the maximum allowed size'), /15 MB/i)
  assert.match(attachmentUploadError('Duplicate object'), /already/i)
  assert.match(attachmentUploadError('invalid mime type'), /PDF, JPG, PNG or WEBP/i)
})

test('an unrecognised storage error still yields a usable message', () => {
  const msg = attachmentUploadError('something nobody predicted')
  assert.ok(msg.length > 0)
  assert.match(msg, /email the files/i)
})

test('a missing error message never throws', () => {
  assert.ok(attachmentUploadError('').length > 0)
})
