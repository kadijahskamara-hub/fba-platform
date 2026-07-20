import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PERMISSION_LABELS, ALL_PERMISSIONS, PERMISSION_GROUPS, PERMISSION_PRESETS,
  groupState, toggleGroup,
} from '../lib/permissionGroups'
import type { StaffPermission } from '../lib/types'

// ============================================================
// Permission grouping (Sprint 25)
// ============================================================

test('every permission appears in exactly ONE group — no orphans, no duplicates', () => {
  const seen = new Map<string, string>()
  for (const g of PERMISSION_GROUPS) {
    for (const p of g.permissions) {
      assert.equal(seen.has(p), false, `"${p}" appears in both "${seen.get(p)}" and "${g.key}"`)
      seen.set(p, g.key)
    }
  }
  for (const p of ALL_PERMISSIONS) {
    assert.equal(seen.has(p), true, `"${p}" is missing from every group — add it to lib/permissionGroups.ts`)
  }
  assert.equal(seen.size, ALL_PERMISSIONS.length)
})

test('every permission has a non-empty label; groups have labels', () => {
  for (const p of ALL_PERMISSIONS) assert.ok(PERMISSION_LABELS[p]?.length > 0, p)
  for (const g of PERMISSION_GROUPS) {
    assert.ok(g.label.length > 0)
    assert.ok(g.permissions.length > 0, `group "${g.key}" is empty`)
  }
})

test('the vocabulary is the expected 46 permissions', () => {
  assert.equal(ALL_PERMISSIONS.length, 46)
})

test('groupState: none / some / all', () => {
  const g = PERMISSION_GROUPS.find(x => x.key === 'orders')!
  assert.equal(groupState(g, []), 'none')
  assert.equal(groupState(g, ['retail_orders']), 'some')
  assert.equal(groupState(g, ['retail_orders', 'commercial_orders']), 'all')
  // unrelated grants don't affect the state
  assert.equal(groupState(g, ['dashboard', 'journals']), 'none')
})

test('toggleGroup grants all when not full, clears the group when full', () => {
  const g = PERMISSION_GROUPS.find(x => x.key === 'orders')!
  const fromNone = toggleGroup(g, ['dashboard'])
  assert.ok(fromNone.includes('retail_orders') && fromNone.includes('commercial_orders'))
  assert.ok(fromNone.includes('dashboard'), 'other grants preserved')
  const fromSome = toggleGroup(g, ['retail_orders'])
  assert.ok(fromSome.includes('commercial_orders'), 'some → all, not clear')
  const fromAll = toggleGroup(g, ['dashboard', 'retail_orders', 'commercial_orders'])
  assert.deepEqual(fromAll, ['dashboard'])
})

test('toggleGroup output preserves canonical permission order', () => {
  const g = PERMISSION_GROUPS.find(x => x.key === 'general')!
  const result = toggleGroup(g, ['journals'])
  const idx = (p: StaffPermission) => ALL_PERMISSIONS.indexOf(p)
  for (let i = 1; i < result.length; i++) {
    assert.ok(idx(result[i - 1]) < idx(result[i]), 'not in canonical order')
  }
})

test('presets contain only valid permissions and NEVER segregated approvals', () => {
  const segregated: StaffPermission[] = [
    'invoice_approve', 'payment_confirm', 'payment_reverse', 'credit_note_approve', 'quote_approve',
  ]
  for (const preset of PERMISSION_PRESETS) {
    assert.ok(preset.permissions.length > 0)
    for (const p of preset.permissions) {
      assert.ok(ALL_PERMISSIONS.includes(p), `preset "${preset.key}" has unknown permission "${p}"`)
      assert.equal(segregated.includes(p), false, `preset "${preset.key}" grants segregated "${p}"`)
    }
    // no duplicates inside a preset
    assert.equal(new Set(preset.permissions).size, preset.permissions.length)
  }
})

test('presets: operations has no finance powers; finance has no delivery powers', () => {
  const ops = PERMISSION_PRESETS.find(p => p.key === 'operations')!
  for (const p of ops.permissions) assert.equal(p.startsWith('invoice_') || p.startsWith('payment_') || p.startsWith('accounting_'), false, p)
  const fin = PERMISSION_PRESETS.find(p => p.key === 'finance')!
  for (const p of fin.permissions) assert.equal(p.startsWith('delivery_') || p === 'pod_record' || p === 'installation_manage', false, p)
})
