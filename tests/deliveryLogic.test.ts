// ============================================================
// Delivery domain logic tests (Sprint 4).
// Node built-in test runner: npm test
// Covers: dispatch/installation state machines, partial-delivery
// coverage + backorder auto-flagging, quantity validation, and
// the no-price deep-scan guard.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canDispatch, canRecordPod, canTransitionDispatch, canTransitionInstallation,
  computeDeliveryCoverage, findForbiddenDeliveryFields, statusCountsAsActive,
  statusCountsAsShipped, validateAssignQuantity,
  DISPATCH_STATUSES, INSTALLATION_STATUSES,
  type DeliveryLineQty, type DispatchStatus,
} from '../lib/commercial/deliveryLogic'

// ── Dispatch state machine ──────────────────────────────────

test('dispatch is only reachable from pending/preparing (atomic fn gate)', () => {
  assert.equal(canDispatch('pending'), true)
  assert.equal(canDispatch('preparing'), true)
  for (const s of DISPATCH_STATUSES.filter(x => x !== 'pending' && x !== 'preparing')) {
    assert.equal(canDispatch(s), false, `canDispatch(${s})`)
  }
})

test('POD is only recordable once the goods have gone out', () => {
  assert.equal(canRecordPod('dispatched'), true)
  assert.equal(canRecordPod('in_transit'), true)
  assert.equal(canRecordPod('partially_delivered'), true)
  assert.equal(canRecordPod('pending'), false)
  assert.equal(canRecordPod('delivered'), false)
  assert.equal(canRecordPod('returned'), false)
})

test('manual transitions: valid moves allowed, shortcuts refused', () => {
  // Allowed manual moves
  assert.equal(canTransitionDispatch('pending', 'preparing'), true)
  assert.equal(canTransitionDispatch('preparing', 'pending'), true)
  assert.equal(canTransitionDispatch('dispatched', 'in_transit'), true)
  assert.equal(canTransitionDispatch('dispatched', 'failed'), true)
  assert.equal(canTransitionDispatch('in_transit', 'failed'), true)
  assert.equal(canTransitionDispatch('failed', 'preparing'), true)
  assert.equal(canTransitionDispatch('delivered', 'returned'), true)
  assert.equal(canTransitionDispatch('partially_delivered', 'returned'), true)
  // Refused: manual dispatch / delivery (must go through atomic SQL fns)
  assert.equal(canTransitionDispatch('pending', 'dispatched'), false)
  assert.equal(canTransitionDispatch('preparing', 'dispatched'), false)
  assert.equal(canTransitionDispatch('dispatched', 'delivered'), false)
  assert.equal(canTransitionDispatch('in_transit', 'delivered'), false)
  assert.equal(canTransitionDispatch('in_transit', 'partially_delivered'), false)
  // Refused: nonsense moves
  assert.equal(canTransitionDispatch('pending', 'in_transit'), false)
  assert.equal(canTransitionDispatch('delivered', 'pending'), false)
  assert.equal(canTransitionDispatch('returned', 'preparing'), false)
})

test('shipped/active status classification', () => {
  assert.equal(statusCountsAsShipped('dispatched'), true)
  assert.equal(statusCountsAsShipped('in_transit'), true)
  assert.equal(statusCountsAsShipped('delivered'), true)
  assert.equal(statusCountsAsShipped('partially_delivered'), true)
  assert.equal(statusCountsAsShipped('pending'), false)
  assert.equal(statusCountsAsShipped('failed'), false)
  assert.equal(statusCountsAsActive('failed'), false)
  assert.equal(statusCountsAsActive('returned'), false)
  assert.equal(statusCountsAsActive('pending'), true)
})

// ── Installation state machine ──────────────────────────────

test('installation lifecycle transitions', () => {
  assert.equal(canTransitionInstallation('to_schedule', 'scheduled'), true)
  assert.equal(canTransitionInstallation('scheduled', 'in_progress'), true)
  assert.equal(canTransitionInstallation('in_progress', 'completed'), true)
  assert.equal(canTransitionInstallation('in_progress', 'snagging'), true)
  assert.equal(canTransitionInstallation('snagging', 'completed'), true)
  assert.equal(canTransitionInstallation('completed', 'snagging'), true)  // defects after sign-off
  assert.equal(canTransitionInstallation('to_schedule', 'not_required'), true)
  // Refused
  assert.equal(canTransitionInstallation('to_schedule', 'completed'), false)
  assert.equal(canTransitionInstallation('completed', 'to_schedule'), false)
  assert.equal(canTransitionInstallation('not_required', 'in_progress'), false)
  for (const s of INSTALLATION_STATUSES) {
    assert.equal(canTransitionInstallation(s, s), false, `self-transition ${s}`)
  }
})

// ── Coverage + backorder auto-flag ──────────────────────────

const ORDER_LINES = [
  { id: 'L1', quantity: 6, name: 'Dining chair' },
  { id: 'L2', quantity: 1, name: 'Console table' },
]
function dl(source: string, qty: number, status: DispatchStatus, lineId = `${source}-${status}-${qty}`): DeliveryLineQty {
  return { delivery_id: `D-${status}`, delivery_line_id: lineId, source_line_item_id: source, quantity: qty, dispatch_status: status }
}

test('no deliveries: everything remains to assign, no backorder', () => {
  const cov = computeDeliveryCoverage(ORDER_LINES, [])
  assert.equal(cov[0].remainingToAssign, 6)
  assert.equal(cov[0].backorder, false)
  assert.equal(cov[1].remainingToAssign, 1)
})

test('assigned to a pending delivery: not shipped, no backorder yet', () => {
  const cov = computeDeliveryCoverage(ORDER_LINES, [dl('L1', 4, 'pending')])
  assert.equal(cov[0].assigned, 4)
  assert.equal(cov[0].shipped, 0)
  assert.equal(cov[0].remainingToAssign, 2)
  assert.equal(cov[0].backorder, false)   // nothing has shipped yet
})

test('part-shipped line: un-shipped remainder auto-flags as backorder (spec §9.4)', () => {
  const cov = computeDeliveryCoverage(ORDER_LINES, [dl('L1', 4, 'dispatched')])
  assert.equal(cov[0].shipped, 4)
  assert.equal(cov[0].remainingToAssign, 2)
  assert.equal(cov[0].backorder, true)
  assert.equal(cov[0].backorderQty, 2)
  // The untouched line is not a backorder
  assert.equal(cov[1].backorder, false)
})

test('remainder scheduled on a second pending delivery clears the backorder', () => {
  const cov = computeDeliveryCoverage(ORDER_LINES, [
    dl('L1', 4, 'delivered'),
    dl('L1', 2, 'pending'),
  ])
  assert.equal(cov[0].assigned, 6)
  assert.equal(cov[0].remainingToAssign, 0)
  assert.equal(cov[0].backorder, false)
})

test('failed/returned deliveries release their assignment', () => {
  const cov = computeDeliveryCoverage(ORDER_LINES, [
    dl('L1', 4, 'failed'),
    dl('L1', 2, 'returned'),
  ])
  assert.equal(cov[0].assigned, 0)
  assert.equal(cov[0].shipped, 0)
  assert.equal(cov[0].remainingToAssign, 6)
  assert.equal(cov[0].backorder, false)
})

test('open shortage exceptions add to the backorder quantity', () => {
  const cov = computeDeliveryCoverage(
    ORDER_LINES,
    [dl('L1', 6, 'partially_delivered', 'DL-1')],
    [{ delivery_line_id: 'DL-1', type: 'shortage', quantity_affected: 2, resolution_status: 'open' }],
  )
  assert.equal(cov[0].shipped, 6)
  assert.equal(cov[0].remainingToAssign, 0)
  assert.equal(cov[0].shortfall, 2)
  assert.equal(cov[0].backorder, true)
  assert.equal(cov[0].backorderQty, 2)
})

test('resolved/credited shortages stop counting; damage never adds backorder qty', () => {
  const covResolved = computeDeliveryCoverage(
    ORDER_LINES,
    [dl('L1', 6, 'delivered', 'DL-1')],
    [{ delivery_line_id: 'DL-1', type: 'shortage', quantity_affected: 2, resolution_status: 'resolved' }],
  )
  assert.equal(covResolved[0].backorder, false)

  const covDamage = computeDeliveryCoverage(
    ORDER_LINES,
    [dl('L1', 6, 'delivered', 'DL-1')],
    [{ delivery_line_id: 'DL-1', type: 'damage', quantity_affected: 2, resolution_status: 'open' }],
  )
  assert.equal(covDamage[0].shortfall, 0)
  assert.equal(covDamage[0].backorder, false)
})

test('fully shipped line is never a backorder', () => {
  const cov = computeDeliveryCoverage(ORDER_LINES, [
    dl('L1', 3, 'delivered'),
    dl('L1', 3, 'delivered'),
  ])
  assert.equal(cov[0].shipped, 6)
  assert.equal(cov[0].backorder, false)
})

// ── Quantity validation ─────────────────────────────────────

test('validateAssignQuantity enforces the un-assigned remainder', () => {
  assert.equal(validateAssignQuantity({ ordered: 6, alreadyAssigned: 0, quantity: 6 }), null)
  assert.equal(validateAssignQuantity({ ordered: 6, alreadyAssigned: 4, quantity: 2 }), null)
  assert.notEqual(validateAssignQuantity({ ordered: 6, alreadyAssigned: 4, quantity: 3 }), null)
  assert.notEqual(validateAssignQuantity({ ordered: 6, alreadyAssigned: 0, quantity: 0 }), null)
  assert.notEqual(validateAssignQuantity({ ordered: 6, alreadyAssigned: 0, quantity: -1 }), null)
  assert.notEqual(validateAssignQuantity({ ordered: 6, alreadyAssigned: 0, quantity: NaN }), null)
})

// ── No-price guard ──────────────────────────────────────────

test('a clean delivery-note-shaped snapshot passes the guard', () => {
  const snap = {
    docType: 'delivery_note',
    deliveryNumber: 'FBA-DEL-2026-0001',
    orderNumber: 'FBA-SO-2026-0003',
    proformaReference: 'FBA-2026-0009',
    delivery: { origin_type: 'consolidated', carrier: 'DHL', instructions: 'Ring twice' },
    location: { label: 'Main site', address_line1: '1 King St', postcode: 'SW1A 1AA', access_notes: 'Goods lift' },
    contacts: [{ name: 'Ade', role: 'Site manager', phone: '07000', email: 'a@b.c', is_primary: true }],
    client: { name: 'Jane', company: 'Studio X' },
    lines: [{
      id: 'x', name: 'Chair', quantity: 2, ordered_quantity: 6, unit_of_measure: 'each',
      selected_finish: 'Walnut', purchase_order_number: 'FBA-PO-2026-0002', notes: null,
    }],
    packages: [{ reference: 'TRK123', weight: '30kg', dimensions: '120×80×90cm' }],
    settings: { company_legal_name: 'FBA Ltd', company_registration_number: '123', contact_email: 'x@y.z' },
  }
  assert.deepEqual(findForbiddenDeliveryFields(snap), [])
})

test('the guard catches money fields at any depth, including arrays', () => {
  const hits1 = findForbiddenDeliveryFields({ lines: [{ name: 'Chair', selling_price_unit: 100 }] })
  assert.ok(hits1.some(h => h.includes('selling_price_unit')), JSON.stringify(hits1))

  const hits2 = findForbiddenDeliveryFields({ a: { b: { supplier_cost_unit: 5 } } })
  assert.ok(hits2.some(h => h.endsWith('a.b.supplier_cost_unit')))

  for (const bad of [
    { line_net_total: 1 }, { gross_total: 1 }, { vat_number: 'GB1' }, { bank_name: 'X' },
    { unit_price: 9 }, { discount_amount: 1 }, { deposit_percent: 50 }, { margin_percent: 30 },
    { markup: 1.4 }, { subtotal: 10 }, { balance_due: 2 }, { tax_total: 3 }, { payment_terms: '30d' },
    { procurement_fee: 12 },
  ]) {
    assert.ok(findForbiddenDeliveryFields(bad).length > 0, `expected hit for ${JSON.stringify(bad)}`)
  }
})

test('the guard allows price-free lookalike keys', () => {
  assert.deepEqual(findForbiddenDeliveryFields({ quantity_affected: 2 }), [])
  assert.deepEqual(findForbiddenDeliveryFields({ postcode: 'SW1' }), [])
  assert.deepEqual(findForbiddenDeliveryFields({ access_notes: 'lift', instructions: 'call ahead' }), [])
})
