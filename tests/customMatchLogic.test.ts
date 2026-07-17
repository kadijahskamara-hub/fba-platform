import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canTransition, nextStatuses, isUnresolvedForProcurement,
  CUSTOM_MATCH_STATUSES, fieldsForMaterial, filterDimensionsPayload,
  applySelection, clearSelection, configurationCompleteness,
  optionBlockedBy, validateConfiguration, configurationAdjustments,
  validateAttachment,
  type ProductConfiguration, type FinishGroupDef, type CompatibilityRule,
} from '../lib/customMatch/logic'

// ── Status workflow ──────────────────────────────────────────

test('every status has a transitions entry', () => {
  for (const s of CUSTOM_MATCH_STATUSES) assert.ok(Array.isArray(nextStatuses(s)), s)
})

test('happy path: draft → submitted → review → maker → approved → converted', () => {
  assert.ok(canTransition('draft', 'submitted'))
  assert.ok(canTransition('submitted', 'under_fba_review'))
  assert.ok(canTransition('under_fba_review', 'sent_to_maker'))
  assert.ok(canTransition('sent_to_maker', 'maker_feasible'))
  assert.ok(canTransition('maker_feasible', 'approved'))
  assert.ok(canTransition('approved', 'converted_to_quote'))
  assert.ok(canTransition('converted_to_quote', 'converted_to_order'))
})

test('illegal jumps are refused', () => {
  assert.equal(canTransition('draft', 'approved'), false)
  assert.equal(canTransition('submitted', 'converted_to_order'), false)
  assert.equal(canTransition('rejected', 'approved'), false)
  assert.equal(canTransition('closed', 'submitted'), false)
})

test('closed is terminal; every non-closed status can eventually close', () => {
  assert.equal(nextStatuses('closed').length, 0)
  for (const s of CUSTOM_MATCH_STATUSES) {
    if (s === 'closed') continue
    assert.ok(nextStatuses(s).includes('closed'), `${s} should allow close`)
  }
})

test('procurement exception flag covers unresolved states only', () => {
  assert.ok(isUnresolvedForProcurement('submitted'))
  assert.ok(isUnresolvedForProcurement('sample_required'))
  assert.ok(isUnresolvedForProcurement('costing_required'))
  assert.equal(isUnresolvedForProcurement('approved'), false)
  assert.equal(isUnresolvedForProcurement('closed'), false)
  assert.equal(isUnresolvedForProcurement('converted_to_order'), false)
})

// ── Material field sets ──────────────────────────────────────

test('material field sets: fabric gets roll width, leather gets hide size, unknown falls back', () => {
  assert.ok(fieldsForMaterial('fabric-upholstery').includes('roll_width'))
  assert.ok(fieldsForMaterial('leather').includes('hide_size'))
  assert.ok(fieldsForMaterial('marble-stone').includes('slab_size'))
  assert.ok(fieldsForMaterial('timber').includes('timber_thickness'))
  assert.deepEqual(fieldsForMaterial('does-not-exist'), fieldsForMaterial('other'))
})

// ── Configuration behaviour ──────────────────────────────────

const groups: FinishGroupDef[] = [
  { id: 'g-top', key: 'tabletop', label: 'Tabletop', required: true, isActive: true },
  { id: 'g-base', key: 'base', label: 'Base', required: true, isActive: true },
  { id: 'g-uph', key: 'upholstery', label: 'Upholstery', required: false, isActive: true },
  { id: 'g-old', key: 'legacy', label: 'Legacy', required: true, isActive: false },
]

const sel = (g: string, o: string, label = o): Parameters<typeof applySelection>[1] => ({
  finishGroupId: g, finishOptionId: o, finishId: `f-${o}`, groupLabel: g, finishLabel: label,
})

test('selecting in one group never erases another (non-negotiable §5.2)', () => {
  let cfg: ProductConfiguration = { productId: 'p1', quantity: 1, selections: {} }
  cfg = applySelection(cfg, sel('g-top', 'calacatta-oro', 'Calacatta Oro'))
  cfg = applySelection(cfg, sel('g-base', 'dark-bronze', 'Dark Bronze'))
  cfg = applySelection(cfg, sel('g-top', 'nero-marquina', 'Nero Marquina')) // re-pick tabletop
  assert.equal(Object.keys(cfg.selections).length, 2)
  assert.equal(cfg.selections['g-top'].finishLabel, 'Nero Marquina')
  assert.equal(cfg.selections['g-base'].finishLabel, 'Dark Bronze')      // preserved
})

test('clearSelection removes only its group', () => {
  let cfg: ProductConfiguration = { productId: 'p1', quantity: 1, selections: {} }
  cfg = applySelection(cfg, sel('g-top', 'a'))
  cfg = applySelection(cfg, sel('g-base', 'b'))
  cfg = clearSelection(cfg, 'g-top')
  assert.deepEqual(Object.keys(cfg.selections), ['g-base'])
})

test('completeness counts only active required groups', () => {
  let cfg: ProductConfiguration = { productId: 'p1', quantity: 1, selections: {} }
  let c = configurationCompleteness(groups, cfg)
  assert.equal(c.requiredTotal, 2)               // legacy group inactive
  assert.equal(c.summary, '0 of 2 required finishes selected')
  cfg = applySelection(cfg, sel('g-top', 'a'))
  c = configurationCompleteness(groups, cfg)
  assert.equal(c.summary, '1 of 2 required finishes selected')
  assert.deepEqual(c.missingGroupLabels, ['Base'])
  cfg = applySelection(cfg, sel('g-base', 'b'))
  c = configurationCompleteness(groups, cfg)
  assert.ok(c.complete)
  assert.equal(c.summary, 'Configuration complete')
})

// ── Compatibility ────────────────────────────────────────────

const rules: CompatibilityRule[] = [
  { sourceFinishOptionId: 'brass', targetFinishOptionId: 'outdoor-teak', isAllowed: false, explanation: 'Brass is not offered on the outdoor frame.', isActive: true },
  { sourceFinishOptionId: 'x', targetFinishOptionId: 'y', isAllowed: false, isActive: false }, // inactive
]

test('optionBlockedBy blocks in both directions, ignores inactive rules', () => {
  let cfg: ProductConfiguration = { productId: 'p1', quantity: 1, selections: {} }
  cfg = applySelection(cfg, sel('g-base', 'outdoor-teak', 'Outdoor Teak'))
  const blocked = optionBlockedBy('brass', cfg, rules)
  assert.ok(blocked.blocked)
  assert.match(blocked.explanation ?? '', /outdoor frame/)
  // reverse direction
  let cfg2: ProductConfiguration = { productId: 'p1', quantity: 1, selections: {} }
  cfg2 = applySelection(cfg2, sel('g-top', 'brass', 'Brass'))
  assert.ok(optionBlockedBy('outdoor-teak', cfg2, rules).blocked)
  // inactive rule never blocks
  let cfg3: ProductConfiguration = { productId: 'p1', quantity: 1, selections: {} }
  cfg3 = applySelection(cfg3, sel('g-top', 'x'))
  assert.equal(optionBlockedBy('y', cfg3, rules).blocked, false)
})

test('validateConfiguration rejects forbidden pairs, missing groups, bad quantity', () => {
  let cfg: ProductConfiguration = { productId: 'p1', quantity: 0, selections: {} }
  cfg = applySelection(cfg, { ...sel('g-top', 'brass', 'Brass') })
  cfg = applySelection(cfg, { ...sel('g-base', 'outdoor-teak', 'Outdoor Teak') })
  const v = validateConfiguration(groups, cfg, rules)
  assert.equal(v.valid, false)
  assert.ok(v.problems.some(p => p.includes('cannot be combined')))
  assert.ok(v.problems.some(p => p.includes('Quantity')))

  const good: ProductConfiguration = {
    productId: 'p1', quantity: 4,
    selections: {
      'g-top': sel('g-top', 'calacatta', 'Calacatta'),
      'g-base': sel('g-base', 'dark-bronze', 'Dark Bronze'),
    },
  }
  const ok = validateConfiguration(groups, good, rules)
  assert.ok(ok.valid, ok.problems.join('; '))
})

test('unknown finish group is reported', () => {
  const cfg: ProductConfiguration = {
    productId: 'p1', quantity: 1,
    selections: { ghost: sel('ghost', 'a') },
  }
  const v = validateConfiguration(groups, cfg, [])
  assert.ok(v.problems.some(p => p.includes('unknown finish group')))
})

// ── Adjustments ──────────────────────────────────────────────

test('price adjustments sum; lead-time takes the max', () => {
  const cfg: ProductConfiguration = {
    productId: 'p1', quantity: 2,
    selections: {
      a: { ...sel('a', 'o1'), priceAdjustment: 120, leadTimeAdjustmentWeeks: 2 },
      b: { ...sel('b', 'o2'), priceAdjustment: -20, leadTimeAdjustmentWeeks: 4 },
      c: { ...sel('c', 'o3') },
    },
  }
  const adj = configurationAdjustments(cfg)
  assert.equal(adj.priceAdjustmentTotal, 100)
  assert.equal(adj.leadTimeAdjustmentWeeksMax, 4)
})

// ── Attachments ──────────────────────────────────────────────

test('attachment validation: allowlist, size, extension/MIME agreement', () => {
  assert.ok(validateAttachment({ filename: 'sample.pdf', mimeType: 'application/pdf', size: 1024 }).ok)
  assert.ok(validateAttachment({ filename: 'swatch.JPG', mimeType: 'image/jpeg', size: 1024 }).ok)
  assert.equal(validateAttachment({ filename: 'run.exe', mimeType: 'application/x-msdownload', size: 10 }).ok, false)
  assert.equal(validateAttachment({ filename: 'huge.png', mimeType: 'image/png', size: 16 * 1024 * 1024 }).ok, false)
  assert.equal(validateAttachment({ filename: 'empty.png', mimeType: 'image/png', size: 0 }).ok, false)
  // extension/MIME mismatch (renamed executable)
  assert.equal(validateAttachment({ filename: 'photo.png', mimeType: 'application/pdf', size: 10 }).ok, false)
})

// ── Dimensions payload filtering (Sprint 13) ─────────────────

test('filterDimensionsPayload keeps only material-relevant fields and coerces values', () => {
  const out = filterDimensionsPayload('fabric-upholstery', {
    roll_width: ' 140cm ',
    hide_size: '5 sqm',            // leather-only — dropped for fabric
    coverage_quantity: 12,          // number → string
    wastage_allowance: '',          // empty → dropped
    __proto__x: 'nope',
    evil: '<script>',
  })
  assert.deepEqual(out, { roll_width: '140cm', coverage_quantity: '12' })
})

test('filterDimensionsPayload survives junk payloads', () => {
  assert.deepEqual(filterDimensionsPayload('timber', null), {})
  assert.deepEqual(filterDimensionsPayload('timber', [1, 2, 3]), {})
  assert.deepEqual(filterDimensionsPayload('timber', 'string'), {})
  const long = filterDimensionsPayload('timber', { timber_thickness: 'x'.repeat(500) })
  assert.equal(long.timber_thickness.length, 300)
})
