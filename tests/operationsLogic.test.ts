// ============================================================
// Operations logic tests (Sprint 7 Part A). Node test runner.
// Covers: lane derivation, milestone timeline, every delay-flag
// rule, lead-time stats (incl. the ≥3-points no-fabrication
// rule), order margin thresholds, exposure maths + alert
// threshold, delivery readiness verdicts, profitability with
// unavailable costs (never guessed), workload predicates and
// operations-settings resolution.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  daysBetween, isPast,
  deriveOrderLane, daysInStage, computeMilestones,
  poDelayFlags, deliveryDelayFlags, installationDelayFlags,
  backorderDelayFlags, orderDelayFlags,
  computeLeadTimeStats, LEAD_TIME_MIN_POINTS,
  computeOrderMargin, computeExposure, deliveryReadiness, computeProfitability,
  isAllocationMissingCost, isPoAwaitingApproval, isPoAwaitingIssue,
  isPoAwaitingAck, isDeliveryToSchedule, isOpenException,
  resolveOperationsSettings, OPERATIONS_SETTINGS_DEFAULTS,
  type PoRowInput, type DeliveryRowInput, type InstallationRowInput,
} from '../lib/commercial/operationsLogic'

const TODAY = '2026-07-15'

const po = (over: Partial<PoRowInput> = {}): PoRowInput => ({
  id: 'po1', purchase_order_number: 'PO-0001', manufacturer_id: 'm1',
  status: 'issued', acknowledgement_due_date: null, acknowledged_at: null,
  expected_completion_date: null, issued_at: '2026-07-01T10:00:00Z',
  grand_total: 1000, ...over,
})
const delivery = (over: Partial<DeliveryRowInput> = {}): DeliveryRowInput => ({
  id: 'd1', delivery_number: 'DL-0001', dispatch_status: 'pending',
  expected_date: null, dispatched_at: null, delivered_at: null, ...over,
})
const install = (over: Partial<InstallationRowInput> = {}): InstallationRowInput => ({
  id: 'i1', status: 'to_schedule', scheduled_date: null, signed_off_at: null, ...over,
})

// ── Date helpers ─────────────────────────────────────────────

test('daysBetween and isPast handle dates and timestamps', () => {
  assert.equal(daysBetween('2026-07-01', '2026-07-15'), 14)
  assert.equal(daysBetween('2026-07-15', '2026-07-01'), -14)
  assert.equal(daysBetween('2026-07-01T23:59:00Z', '2026-07-15'), 14)
  assert.equal(isPast('2026-07-14', TODAY), true)
  assert.equal(isPast('2026-07-15', TODAY), false)
  assert.equal(isPast(null, TODAY), false)
})

// ── Lanes ────────────────────────────────────────────────────

test('deriveOrderLane maps order state through the pipeline', () => {
  const base = { status: 'accepted' }
  assert.equal(deriveOrderLane(base, [], [], []), 'accepted')
  assert.equal(deriveOrderLane({ status: 'procurement_ready' }, [], [], []), 'procurement')
  assert.equal(deriveOrderLane({ status: 'fully_ordered' }, [po({ status: 'in_production' })], [], []), 'production')
  assert.equal(deriveOrderLane({ status: 'in_progress' }, [], [delivery({ dispatch_status: 'in_transit' })], []), 'dispatch')
  assert.equal(deriveOrderLane({ status: 'partially_delivered' }, [], [delivery({ dispatch_status: 'delivered' })], []), 'delivered')
  assert.equal(deriveOrderLane(
    { status: 'in_progress' },
    [],
    [delivery({ dispatch_status: 'delivered' })],
    [install({ status: 'completed', signed_off_at: '2026-07-10T00:00:00Z' })],
  ), 'installed')
  assert.equal(deriveOrderLane({ status: 'completed' }, [], [], []), 'closed')
  assert.equal(deriveOrderLane({ status: 'cancelled' }, [], [], []), 'cancelled')
  assert.equal(deriveOrderLane({ status: 'draft' }, [], [], []), 'pre_acceptance')
})

test('daysInStage uses the latest activity timestamp', () => {
  assert.equal(daysInStage({ id: 'o', status: 'accepted', accepted_at: '2026-07-01', updated_at: '2026-07-10' }, TODAY), 5)
})

// ── Milestones ───────────────────────────────────────────────

test('computeMilestones derives every milestone from records', () => {
  const ms = computeMilestones({
    order: { id: 'o', status: 'in_progress', accepted_at: '2026-06-01T09:00:00Z', updated_at: '2026-07-01' },
    allocations: [
      { id: 'a1', allocation_status: 'included_in_po', supplier_cost_total: 500 },
      { id: 'a2', allocation_status: 'included_in_po', supplier_cost_total: 300 },
    ],
    pos: [
      po({ id: 'p1', issued_at: '2026-06-05T09:00:00Z', acknowledged_at: '2026-06-07T09:00:00Z', expected_completion_date: '2026-07-20', status: 'in_production' }),
      po({ id: 'p2', issued_at: '2026-06-06T09:00:00Z', acknowledged_at: '2026-06-09T09:00:00Z', expected_completion_date: '2026-07-25', status: 'in_production' }),
    ],
    deliveries: [delivery({ dispatch_status: 'delivered', dispatched_at: '2026-07-01T08:00:00Z', delivered_at: '2026-07-03T08:00:00Z' })],
    installations: [install({ status: 'completed', signed_off_at: '2026-07-05T08:00:00Z' })],
  })
  const byKey = Object.fromEntries(ms.map(m => [m.key, m]))
  assert.equal(byKey.accepted.reached, true)
  assert.equal(byKey.allocations_complete.reached, true)
  assert.equal(byKey.pos_issued.reached, true)
  assert.equal(byKey.pos_acknowledged.date, '2026-06-09T09:00:00Z') // max of the two
  assert.equal(byKey.production_due.date, '2026-07-25')
  assert.equal(byKey.dispatched.reached, true)
  assert.equal(byKey.delivered.reached, true)
  assert.equal(byKey.installation_signed_off.reached, true)
})

test('milestones are honest about incompleteness', () => {
  const ms = computeMilestones({
    order: { id: 'o', status: 'accepted', accepted_at: '2026-06-01', updated_at: '2026-06-01' },
    allocations: [{ id: 'a1', allocation_status: 'allocated', supplier_cost_total: null }],
    pos: [po({ acknowledged_at: null }), po({ id: 'p2', acknowledged_at: '2026-06-08', issued_at: null })],
    deliveries: [delivery({ dispatch_status: 'partially_delivered', delivered_at: '2026-07-01' })],
    installations: [],
  })
  const byKey = Object.fromEntries(ms.map(m => [m.key, m]))
  assert.equal(byKey.allocations_complete.reached, false)
  assert.equal(byKey.pos_issued.reached, false)       // one PO not issued
  assert.equal(byKey.pos_acknowledged.reached, false) // one PO not acked
  assert.equal(byKey.delivered.reached, false)        // partial ≠ all delivered
  assert.equal(byKey.installation_signed_off.reached, false) // none required ⇒ not reached
})

// ── Delay flags ──────────────────────────────────────────────

test('po_unacknowledged_overdue: issued/viewed past due without ack', () => {
  const flags = poDelayFlags([
    po({ status: 'issued', acknowledgement_due_date: '2026-07-10' }),
    po({ id: 'ok1', status: 'issued', acknowledgement_due_date: '2026-07-20' }),
    po({ id: 'ok2', status: 'acknowledged', acknowledgement_due_date: '2026-07-10', acknowledged_at: '2026-07-09' }),
    po({ id: 'ok3', status: 'cancelled', acknowledgement_due_date: '2026-07-01' }),
  ], TODAY)
  assert.equal(flags.length, 1)
  assert.equal(flags[0].type, 'po_unacknowledged_overdue')
  assert.equal(flags[0].daysLate, 5)
})

test('po_production_overdue: expected completion in the past without dispatch', () => {
  const flags = poDelayFlags([
    po({ status: 'in_production', expected_completion_date: '2026-07-01' }),
    po({ id: 'ok1', status: 'dispatched', expected_completion_date: '2026-07-01' }),
    po({ id: 'ok2', status: 'received', expected_completion_date: '2026-07-01' }),
  ], TODAY)
  assert.equal(flags.length, 1)
  assert.equal(flags[0].type, 'po_production_overdue')
  assert.equal(flags[0].daysLate, 14)
})

test('delivery_overdue: past expected date, not dispatched', () => {
  const flags = deliveryDelayFlags([
    delivery({ expected_date: '2026-07-10' }),
    delivery({ id: 'ok1', expected_date: '2026-07-10', dispatched_at: '2026-07-09T10:00:00Z', dispatch_status: 'dispatched' }),
    delivery({ id: 'ok2', expected_date: '2026-07-10', dispatch_status: 'delivered', delivered_at: '2026-07-11' }),
  ], TODAY)
  assert.equal(flags.length, 1)
  assert.equal(flags[0].type, 'delivery_overdue')
})

test('installation_overdue: scheduled date passed without completion', () => {
  const flags = installationDelayFlags([
    install({ status: 'scheduled', scheduled_date: '2026-07-12' }),
    install({ id: 'ok1', status: 'completed', scheduled_date: '2026-07-12' }),
    install({ id: 'ok2', status: 'not_required', scheduled_date: '2026-07-01' }),
  ], TODAY)
  assert.equal(flags.length, 1)
  assert.equal(flags[0].type, 'installation_overdue')
  assert.equal(flags[0].daysLate, 3)
})

test('backorder_stale: open/reordering exceptions older than N days (setting)', () => {
  const flags = backorderDelayFlags([
    { id: 'e1', resolution_status: 'open', created_at: '2026-06-01T00:00:00Z' },
    { id: 'e2', resolution_status: 'reordering', created_at: '2026-07-10T00:00:00Z' },
    { id: 'e3', resolution_status: 'resolved', created_at: '2026-05-01T00:00:00Z' },
  ], TODAY, 14)
  assert.equal(flags.length, 1)
  assert.equal(flags[0].refId, 'e1')
})

test('orderDelayFlags rolls all rule families up to order level', () => {
  const flags = orderDelayFlags({
    pos: [po({ status: 'issued', acknowledgement_due_date: '2026-07-01' })],
    deliveries: [delivery({ expected_date: '2026-07-01' })],
    installations: [install({ status: 'scheduled', scheduled_date: '2026-07-01' })],
    exceptions: [{ id: 'e1', resolution_status: 'open', created_at: '2026-06-01' }],
    today: TODAY,
    backorderStaleDays: 14,
  })
  assert.equal(flags.length, 4)
  assert.deepEqual(
    flags.map(f => f.type).sort(),
    ['backorder_stale', 'delivery_overdue', 'installation_overdue', 'po_unacknowledged_overdue'],
  )
})

// ── Lead time ────────────────────────────────────────────────

test('computeLeadTimeStats needs ≥3 complete pairs — never fabricates', () => {
  assert.equal(LEAD_TIME_MIN_POINTS, 3)
  assert.equal(computeLeadTimeStats([]), null)
  assert.equal(computeLeadTimeStats([
    { expected: '2026-06-01', actual: '2026-06-03' },
    { expected: '2026-06-10', actual: null },        // incomplete pair doesn't count
    { expected: '2026-06-15', actual: '2026-06-15' },
  ]), null)
})

test('computeLeadTimeStats variance and on-time rate', () => {
  const stats = computeLeadTimeStats([
    { expected: '2026-06-01', actual: '2026-06-03' },  // +2
    { expected: '2026-06-10', actual: '2026-06-08' },  // −2
    { expected: '2026-06-20', actual: '2026-06-26' },  // +6
  ])
  assert.ok(stats)
  assert.equal(stats!.count, 3)
  assert.equal(stats!.avgVarianceDays, 2)
  assert.equal(stats!.maxVarianceDays, 6)
  assert.equal(stats!.onTimeRate, 0.33)
})

// ── Margin & exposure ────────────────────────────────────────

test('computeOrderMargin applies the Sprint-2 thresholds', () => {
  const thresholds = { margin_commercial_below: 25, margin_ultra_below: 10 }
  const healthy = computeOrderMargin({ sellingTotal: 1000, committedCost: 600, thresholds })
  assert.equal(healthy.marginPct, 40)
  assert.equal(healthy.belowCommercialThreshold, false)
  const squeezed = computeOrderMargin({ sellingTotal: 1000, committedCost: 850, thresholds })
  assert.equal(squeezed.marginPct, 15)
  assert.equal(squeezed.belowCommercialThreshold, true)
  assert.equal(squeezed.belowUltraThreshold, false)
  const critical = computeOrderMargin({ sellingTotal: 1000, committedCost: 950, thresholds })
  assert.equal(critical.belowUltraThreshold, true)
  const zero = computeOrderMargin({ sellingTotal: 0, committedCost: 100, thresholds })
  assert.equal(zero.marginPct, null)
})

test('computeExposure: committed vs confirmed client money', () => {
  const view = computeExposure({
    invoices: [
      { id: 'i1', status: 'issued', gross_total: 12000, amount_paid: 6000 },
      { id: 'i2', status: 'draft', gross_total: 5000, amount_paid: 0 },   // drafts don't count
    ],
    payments: [
      { id: 'p1', status: 'confirmed', amount: 6000 },
      { id: 'p2', status: 'pending', amount: 2000 },   // unconfirmed doesn't count
    ],
    pos: [
      po({ status: 'issued', grand_total: 7000 }),
      po({ id: 'p2', status: 'in_production', grand_total: 2000 }),
      po({ id: 'p3', status: 'draft', grand_total: 9999 }),  // not committed yet
    ],
    allocations: [
      { id: 'a1', allocation_status: 'ready_for_po', supplier_cost_total: 1500 },
      { id: 'a2', allocation_status: 'included_in_po', supplier_cost_total: 7000 },
    ],
    exposureAlertPercent: 30,
  })
  assert.equal(view.clientInvoiced, 12000)
  assert.equal(view.clientPaidConfirmed, 6000)
  assert.equal(view.supplierCommitted, 9000)
  assert.equal(view.supplierUncommitted, 1500)
  assert.equal(view.netExposure, 3000)
  assert.equal(view.exposurePct, 33.3)
  assert.equal(view.breachesThreshold, true)
})

test('computeExposure never reports negative exposure', () => {
  const view = computeExposure({
    invoices: [], payments: [{ id: 'p', status: 'confirmed', amount: 10000 }],
    pos: [po({ status: 'issued', grand_total: 4000 })],
    allocations: [], exposureAlertPercent: 50,
  })
  assert.equal(view.netExposure, 0)
  assert.equal(view.breachesThreshold, false)
})

// ── Readiness ────────────────────────────────────────────────

test('deliveryReadiness verdicts', () => {
  const ready = deliveryReadiness({
    outstandingLines: 0, hasSiteAddress: true, hasSiteContact: true,
    depositSatisfied: true, openExceptions: 0,
  })
  assert.deepEqual(ready, { ready: true, blockers: [] })

  const blocked = deliveryReadiness({
    outstandingLines: 2, hasSiteAddress: false, hasSiteContact: true,
    depositSatisfied: false, openExceptions: 1,
  })
  assert.equal(blocked.ready, false)
  assert.equal(blocked.blockers.length, 4)
})

// ── Profitability ────────────────────────────────────────────

test('computeProfitability flags unavailable costs and never guesses', () => {
  const complete = computeProfitability({
    clientNetSelling: 10000, procurementFee: 500,
    supplierCosts: [{ total: 4000 }, { total: 1500 }],
  })
  assert.equal(complete.revenue, 10500)
  assert.equal(complete.knownCosts, 5500)
  assert.equal(complete.projectedMargin, 5000)
  assert.equal(complete.marginPct, 47.6)

  const incomplete = computeProfitability({
    clientNetSelling: 10000, procurementFee: 500,
    supplierCosts: [{ total: 4000 }, { total: null }],
  })
  assert.equal(incomplete.costUnavailableCount, 1)
  assert.equal(incomplete.projectedMargin, null)  // not fabricated
  assert.equal(incomplete.marginPct, null)
  assert.equal(incomplete.knownCosts, 4000)
})

// ── Workload predicates ──────────────────────────────────────

test('workload predicates classify open items', () => {
  assert.equal(isAllocationMissingCost({ id: 'a', allocation_status: 'allocated', supplier_cost_total: null, supplier_currency: 'EUR' }), true)
  assert.equal(isAllocationMissingCost({ id: 'a', allocation_status: 'allocated', supplier_cost_total: 100, supplier_currency: null }), true)
  assert.equal(isAllocationMissingCost({ id: 'a', allocation_status: 'cancelled', supplier_cost_total: null, supplier_currency: null }), false)
  assert.equal(isAllocationMissingCost({ id: 'a', allocation_status: 'allocated', supplier_cost_total: 100, supplier_currency: 'EUR' }), false)

  assert.equal(isPoAwaitingApproval({ status: 'pending_approval', approval_status: 'required' }), true)
  assert.equal(isPoAwaitingApproval({ status: 'draft', approval_status: 'required' }), true)
  assert.equal(isPoAwaitingApproval({ status: 'draft', approval_status: 'none' }), false)
  assert.equal(isPoAwaitingIssue({ status: 'approved' }), true)
  assert.equal(isPoAwaitingIssue({ status: 'issued' }), false)
  assert.equal(isPoAwaitingAck({ status: 'issued', acknowledged_at: null }), true)
  assert.equal(isPoAwaitingAck({ status: 'viewed', acknowledged_at: null }), true)
  assert.equal(isPoAwaitingAck({ status: 'issued', acknowledged_at: '2026-07-01' }), false)

  assert.equal(isDeliveryToSchedule({ dispatch_status: 'pending', expected_date: null }), true)
  assert.equal(isDeliveryToSchedule({ dispatch_status: 'pending', expected_date: '2026-08-01' }), false)
  assert.equal(isOpenException({ resolution_status: 'open' }), true)
  assert.equal(isOpenException({ resolution_status: 'reordering' }), true)
  assert.equal(isOpenException({ resolution_status: 'resolved' }), false)
})

// ── Settings ─────────────────────────────────────────────────

test('resolveOperationsSettings merges stored values over defaults', () => {
  assert.deepEqual(resolveOperationsSettings(null), OPERATIONS_SETTINGS_DEFAULTS)
  const merged = resolveOperationsSettings({ backorder_flag_days: 7, exposure_alert_percent: 'nonsense', stale_order_days: -5 })
  assert.equal(merged.backorder_flag_days, 7)
  assert.equal(merged.exposure_alert_percent, OPERATIONS_SETTINGS_DEFAULTS.exposure_alert_percent)
  assert.equal(merged.stale_order_days, OPERATIONS_SETTINGS_DEFAULTS.stale_order_days)
})
