// ============================================================
// Procurement operations logic (Sprint 7 Part A) — pure functions.
//
// Everything the operations dashboard derives — pipeline lanes,
// milestone timelines, delay flags, lead-time stats, exposure,
// delivery readiness and profitability — is computed here from
// plain row inputs so every rule is unit-testable without a
// database. No fabrication: where data is missing (costs
// unavailable, <3 lead-time data points) the functions say so
// instead of guessing.
//
// Pure module: no imports, importable from tests and any runtime.
// ============================================================

// ── Shared date helpers (YYYY-MM-DD / ISO strings) ───────────

/** Days from a to b (b - a), using UTC midnights. Accepts date or timestamp strings. */
export function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
  return Math.round((db - da) / 86400000)
}

/** True when `date` (YYYY-MM-DD or ISO) is strictly before `today` (YYYY-MM-DD). */
export function isPast(date: string | null | undefined, today: string): boolean {
  if (!date) return false
  return date.slice(0, 10) < today
}

// ── Row inputs (narrow views of the Sprint 1–6 tables) ────────

export interface OrderRowInput {
  id: string
  status: string            // commercial_orders.status
  accepted_at: string | null
  updated_at: string
}

export interface PoRowInput {
  id: string
  purchase_order_number?: string | null
  manufacturer_id: string | null
  status: string            // draft…cancelled (Sprint 2 vocabulary)
  approval_status?: string | null
  acknowledgement_due_date: string | null
  acknowledged_at: string | null
  required_by_date?: string | null
  expected_completion_date: string | null
  issued_at: string | null
  grand_total: number | null
  margin_at_risk?: boolean | null
  margin_resolution?: string | null
  cancelled_at?: string | null
}

export interface AllocationRowInput {
  id: string
  allocation_status: string // unallocated…cancelled
  supplier_cost_total: number | null
  supplier_currency?: string | null
}

export interface DeliveryRowInput {
  id: string
  delivery_number?: string | null
  dispatch_status: string   // pending…returned
  expected_date: string | null
  dispatched_at: string | null
  delivered_at: string | null
}

export interface InstallationRowInput {
  id: string
  status: string            // not_required…snagging
  scheduled_date: string | null
  signed_off_at: string | null
}

export interface ExceptionRowInput {
  id: string
  resolution_status: string // open | reordering | credited | resolved
  created_at: string
}

export interface InvoiceRowInput {
  id: string
  status: string            // draft…cancelled
  gross_total: number | null
  amount_paid: number | null
}

export interface PaymentRowInput {
  id: string
  status: string            // pending | confirmed | reversed | refunded | failed
  amount: number | null
}

// ── 1. Pipeline lanes ─────────────────────────────────────────

export type OperationsLane =
  | 'accepted' | 'procurement' | 'production' | 'dispatch'
  | 'delivered' | 'installed' | 'closed' | 'cancelled' | 'pre_acceptance'

export const OPERATIONS_LANES: OperationsLane[] = [
  'accepted', 'procurement', 'production', 'dispatch', 'delivered', 'installed', 'closed',
]

export const LANE_LABELS: Record<OperationsLane, string> = {
  pre_acceptance: 'Pre-acceptance',
  accepted: 'Accepted',
  procurement: 'Procurement',
  production: 'Production',
  dispatch: 'Dispatch',
  delivered: 'Delivered',
  installed: 'Installed',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

/**
 * Order status → dashboard lane. Production/dispatch/installed are
 * refined from PO, delivery and installation states because
 * commercial_orders.status alone does not distinguish them.
 */
export function deriveOrderLane(
  order: Pick<OrderRowInput, 'status'>,
  pos: Pick<PoRowInput, 'status'>[],
  deliveries: Pick<DeliveryRowInput, 'dispatch_status'>[],
  installations: Pick<InstallationRowInput, 'status'>[],
): OperationsLane {
  const s = order.status
  if (s === 'cancelled') return 'cancelled'
  if (s === 'draft' || s === 'pending_acceptance') return 'pre_acceptance'
  if (s === 'completed') return 'closed'

  const hasInstallation = installations.some(i => i.status !== 'not_required')
  const allInstallationsDone = hasInstallation && installations
    .filter(i => i.status !== 'not_required')
    .every(i => i.status === 'completed')
  const anyDelivered = deliveries.some(d => d.dispatch_status === 'delivered' || d.dispatch_status === 'partially_delivered')
  const allDelivered = deliveries.length > 0 && deliveries.every(d =>
    d.dispatch_status === 'delivered' || d.dispatch_status === 'returned')
  const anyDispatched = deliveries.some(d =>
    d.dispatch_status === 'dispatched' || d.dispatch_status === 'in_transit')
  const anyInProduction = pos.some(p =>
    ['confirmed', 'in_production', 'ready_for_dispatch', 'acknowledged'].includes(p.status))

  if (allInstallationsDone && allDelivered) return 'installed'
  if (anyDelivered || s === 'partially_delivered') {
    return allDelivered && !hasInstallation ? 'delivered' : anyDispatched ? 'dispatch' : 'delivered'
  }
  if (anyDispatched) return 'dispatch'
  if (anyInProduction || s === 'in_progress') return 'production'
  if (s === 'partially_ordered' || s === 'fully_ordered' || s === 'procurement_ready') return 'procurement'
  return 'accepted'
}

/** Days the order has sat in its current lane (best available signal). */
export function daysInStage(order: OrderRowInput, today: string): number {
  const ref = order.updated_at ?? order.accepted_at
  return ref ? Math.max(0, daysBetween(ref, today)) : 0
}

// ── 2. Milestones (derived, never manually entered) ───────────

export interface Milestone {
  key: string
  label: string
  date: string | null   // ISO date/timestamp of the record that proves it
  reached: boolean
}

export function computeMilestones(input: {
  order: OrderRowInput
  allocations: AllocationRowInput[]
  pos: PoRowInput[]
  deliveries: DeliveryRowInput[]
  installations: InstallationRowInput[]
}): Milestone[] {
  const { order, allocations, pos, deliveries, installations } = input
  const activePos = pos.filter(p => p.status !== 'cancelled')
  const liveAllocations = allocations.filter(a =>
    a.allocation_status !== 'cancelled' && a.allocation_status !== 'superseded')

  const allocationsComplete = liveAllocations.length > 0 &&
    liveAllocations.every(a => a.allocation_status === 'included_in_po')
  const issuedPos = activePos.filter(p => p.issued_at)
  const allPosIssued = activePos.length > 0 && issuedPos.length === activePos.length
  const ackedPos = activePos.filter(p => p.acknowledged_at)
  const allPosAcked = activePos.length > 0 && ackedPos.length === activePos.length

  const maxDate = (dates: (string | null)[]): string | null => {
    const set = dates.filter((d): d is string => Boolean(d)).sort()
    return set.length ? set[set.length - 1] : null
  }

  const productionDue = maxDate(activePos.map(p => p.expected_completion_date))
  const dispatchedAt = maxDate(deliveries.map(d => d.dispatched_at))
  const allDelivered = deliveries.length > 0 &&
    deliveries.every(d => d.dispatch_status === 'delivered' || d.dispatch_status === 'returned')
  const deliveredAt = allDelivered ? maxDate(deliveries.map(d => d.delivered_at)) : null
  const requiredInstalls = installations.filter(i => i.status !== 'not_required')
  const allSignedOff = requiredInstalls.length > 0 && requiredInstalls.every(i => i.signed_off_at)
  const signedOffAt = allSignedOff ? maxDate(requiredInstalls.map(i => i.signed_off_at)) : null

  return [
    { key: 'accepted', label: 'Order accepted', date: order.accepted_at, reached: Boolean(order.accepted_at) },
    { key: 'allocations_complete', label: 'Allocations complete', date: null, reached: allocationsComplete },
    { key: 'pos_issued', label: 'All POs issued', date: allPosIssued ? maxDate(issuedPos.map(p => p.issued_at)) : null, reached: allPosIssued },
    { key: 'pos_acknowledged', label: 'All POs acknowledged', date: allPosAcked ? maxDate(ackedPos.map(p => p.acknowledged_at)) : null, reached: allPosAcked },
    { key: 'production_due', label: 'Production due', date: productionDue, reached: Boolean(productionDue) },
    { key: 'dispatched', label: 'Dispatched', date: dispatchedAt, reached: Boolean(dispatchedAt) },
    { key: 'delivered', label: 'Delivered', date: deliveredAt, reached: allDelivered },
    { key: 'installation_signed_off', label: 'Installation signed off', date: signedOffAt, reached: allSignedOff },
  ]
}

// ── 3. Delay flags (deterministic rules) ──────────────────────

export type DelayFlagType =
  | 'po_unacknowledged_overdue'
  | 'po_production_overdue'
  | 'delivery_overdue'
  | 'installation_overdue'
  | 'backorder_stale'

export interface DelayFlag {
  type: DelayFlagType
  refId: string
  refLabel: string | null
  daysLate: number
  detail: string
}

const PO_PRE_ACK = new Set(['issued', 'viewed'])
const PO_NOT_YET_DISPATCHED = new Set([
  'issued', 'viewed', 'acknowledged', 'supplier_amendment_requested',
  'revised', 'confirmed', 'in_production', 'ready_for_dispatch',
])

export function poDelayFlags(pos: PoRowInput[], today: string): DelayFlag[] {
  const flags: DelayFlag[] = []
  for (const po of pos) {
    if (po.status === 'cancelled') continue
    if (PO_PRE_ACK.has(po.status) && isPast(po.acknowledgement_due_date, today) && !po.acknowledged_at) {
      flags.push({
        type: 'po_unacknowledged_overdue',
        refId: po.id,
        refLabel: po.purchase_order_number ?? null,
        daysLate: daysBetween(po.acknowledgement_due_date!, today),
        detail: `Acknowledgement was due ${po.acknowledgement_due_date}`,
      })
    }
    if (PO_NOT_YET_DISPATCHED.has(po.status) && isPast(po.expected_completion_date, today)) {
      flags.push({
        type: 'po_production_overdue',
        refId: po.id,
        refLabel: po.purchase_order_number ?? null,
        daysLate: daysBetween(po.expected_completion_date!, today),
        detail: `Expected completion ${po.expected_completion_date} has passed without dispatch`,
      })
    }
  }
  return flags
}

export function deliveryDelayFlags(deliveries: DeliveryRowInput[], today: string): DelayFlag[] {
  const flags: DelayFlag[] = []
  for (const d of deliveries) {
    const done = d.dispatch_status === 'delivered' || d.dispatch_status === 'returned'
    if (!done && !d.dispatched_at && !d.delivered_at && isPast(d.expected_date, today)) {
      flags.push({
        type: 'delivery_overdue',
        refId: d.id,
        refLabel: d.delivery_number ?? null,
        daysLate: daysBetween(d.expected_date!, today),
        detail: `Expected ${d.expected_date}, not yet dispatched`,
      })
    }
  }
  return flags
}

export function installationDelayFlags(installations: InstallationRowInput[], today: string): DelayFlag[] {
  const flags: DelayFlag[] = []
  for (const i of installations) {
    if (i.status === 'completed' || i.status === 'not_required') continue
    if (isPast(i.scheduled_date, today)) {
      flags.push({
        type: 'installation_overdue',
        refId: i.id,
        refLabel: null,
        daysLate: daysBetween(i.scheduled_date!, today),
        detail: `Scheduled ${i.scheduled_date}, not completed`,
      })
    }
  }
  return flags
}

export function backorderDelayFlags(
  exceptions: ExceptionRowInput[],
  today: string,
  staleDays: number,
): DelayFlag[] {
  const flags: DelayFlag[] = []
  for (const e of exceptions) {
    if (e.resolution_status !== 'open' && e.resolution_status !== 'reordering') continue
    const age = daysBetween(e.created_at, today)
    if (age > staleDays) {
      flags.push({
        type: 'backorder_stale',
        refId: e.id,
        refLabel: null,
        daysLate: age - staleDays,
        detail: `Open exception for ${age} days (threshold ${staleDays})`,
      })
    }
  }
  return flags
}

/** All flags for one order, rolled up. Drives the "needs attention" lane. */
export function orderDelayFlags(input: {
  pos: PoRowInput[]
  deliveries: DeliveryRowInput[]
  installations: InstallationRowInput[]
  exceptions: ExceptionRowInput[]
  today: string
  backorderStaleDays: number
}): DelayFlag[] {
  return [
    ...poDelayFlags(input.pos, input.today),
    ...deliveryDelayFlags(input.deliveries, input.today),
    ...installationDelayFlags(input.installations, input.today),
    ...backorderDelayFlags(input.exceptions, input.today, input.backorderStaleDays),
  ]
}

// ── 4. Lead-time monitoring (computed from history, ≥3 points) ─

export interface LeadTimeEntry {
  expected: string | null   // promised date (expected_completion / expected_date)
  actual: string | null     // what happened (dispatched_at / delivered_at)
}

export interface LeadTimeStats {
  count: number
  avgVarianceDays: number   // +ve = later than promised
  maxVarianceDays: number
  onTimeRate: number        // 0..1, actual <= expected
}

export const LEAD_TIME_MIN_POINTS = 3

/**
 * Expected-vs-actual stats. Returns null with fewer than
 * LEAD_TIME_MIN_POINTS complete pairs — figures are never fabricated.
 */
export function computeLeadTimeStats(entries: LeadTimeEntry[]): LeadTimeStats | null {
  const pairs = entries.filter(e => e.expected && e.actual)
  if (pairs.length < LEAD_TIME_MIN_POINTS) return null
  const variances = pairs.map(e => daysBetween(e.expected!, e.actual!))
  const sum = variances.reduce((a, b) => a + b, 0)
  const onTime = variances.filter(v => v <= 0).length
  return {
    count: pairs.length,
    avgVarianceDays: Math.round((sum / pairs.length) * 10) / 10,
    maxVarianceDays: Math.max(...variances),
    onTimeRate: Math.round((onTime / pairs.length) * 100) / 100,
  }
}

// ── 5. Margin at risk / recomputed order margin ───────────────

export interface MarginView {
  sellingTotal: number          // client net selling (ex VAT)
  committedCost: number         // issued/confirmed PO totals
  projectedMargin: number
  marginPct: number | null      // null when sellingTotal is 0
  belowCommercialThreshold: boolean
  belowUltraThreshold: boolean
}

export function computeOrderMargin(input: {
  sellingTotal: number
  committedCost: number
  thresholds: { margin_commercial_below: number; margin_ultra_below: number }
}): MarginView {
  const { sellingTotal, committedCost, thresholds } = input
  const projectedMargin = sellingTotal - committedCost
  const marginPct = sellingTotal > 0
    ? Math.round((projectedMargin / sellingTotal) * 1000) / 10
    : null
  return {
    sellingTotal, committedCost, projectedMargin, marginPct,
    belowCommercialThreshold: marginPct !== null && marginPct < thresholds.margin_commercial_below,
    belowUltraThreshold: marginPct !== null && marginPct < thresholds.margin_ultra_below,
  }
}

// ── 6. Client payment vs supplier commitment (exposure) ───────

export interface ExposureView {
  clientInvoiced: number
  clientPaidConfirmed: number
  supplierCommitted: number     // issued+ PO grand totals
  supplierUncommitted: number   // live allocations not yet on an issued PO
  netExposure: number           // committed − confirmed client money (≥0 means at risk)
  exposurePct: number | null    // exposure as % of committed (null when nothing committed)
  breachesThreshold: boolean
}

const PO_COMMITTED = new Set([
  'issued', 'viewed', 'acknowledged', 'supplier_amendment_requested', 'revised',
  'confirmed', 'in_production', 'ready_for_dispatch', 'dispatched',
  'partially_received', 'received',
])

export function computeExposure(input: {
  invoices: InvoiceRowInput[]
  payments: PaymentRowInput[]
  pos: PoRowInput[]
  allocations: AllocationRowInput[]
  exposureAlertPercent: number   // flag when netExposure/committed × 100 ≥ this
}): ExposureView {
  const clientInvoiced = input.invoices
    .filter(i => !['draft', 'pending_approval', 'void', 'cancelled'].includes(i.status))
    .reduce((s, i) => s + (i.gross_total ?? 0), 0)
  const clientPaidConfirmed = input.payments
    .filter(p => p.status === 'confirmed')
    .reduce((s, p) => s + (p.amount ?? 0), 0)
  const supplierCommitted = input.pos
    .filter(p => PO_COMMITTED.has(p.status))
    .reduce((s, p) => s + (p.grand_total ?? 0), 0)
  const supplierUncommitted = input.allocations
    .filter(a => ['unallocated', 'allocated', 'ready_for_po'].includes(a.allocation_status))
    .reduce((s, a) => s + (a.supplier_cost_total ?? 0), 0)

  const netExposure = Math.max(0, supplierCommitted - clientPaidConfirmed)
  const exposurePct = supplierCommitted > 0
    ? Math.round((netExposure / supplierCommitted) * 1000) / 10
    : null

  return {
    clientInvoiced: round2(clientInvoiced),
    clientPaidConfirmed: round2(clientPaidConfirmed),
    supplierCommitted: round2(supplierCommitted),
    supplierUncommitted: round2(supplierUncommitted),
    netExposure: round2(netExposure),
    exposurePct,
    breachesThreshold: exposurePct !== null && exposurePct >= input.exposureAlertPercent,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

// ── 7. Delivery readiness ─────────────────────────────────────

export interface ReadinessInput {
  outstandingLines: number        // Sprint 4 coverage: allocation qty not yet on deliveries
  hasSiteAddress: boolean
  hasSiteContact: boolean
  depositSatisfied: boolean       // client balance state from Sprint 3
  openExceptions: number
}

export interface ReadinessVerdict {
  ready: boolean
  blockers: string[]
}

export function deliveryReadiness(input: ReadinessInput): ReadinessVerdict {
  const blockers: string[] = []
  if (input.outstandingLines > 0) blockers.push(`${input.outstandingLines} line(s) not yet covered by a delivery`)
  if (!input.hasSiteAddress) blockers.push('No site address on file')
  if (!input.hasSiteContact) blockers.push('No site contact on file')
  if (!input.depositSatisfied) blockers.push('Client balance not satisfied (deposit/stage unpaid)')
  if (input.openExceptions > 0) blockers.push(`${input.openExceptions} open delivery exception(s)`)
  return { ready: blockers.length === 0, blockers }
}

// ── 8. Project profitability (never guess missing costs) ──────

export interface ProfitabilityInput {
  clientNetSelling: number        // ex-VAT selling total
  procurementFee: number
  supplierCosts: { total: number | null }[]  // allocation/PO actuals; null = unavailable
}

export interface ProfitabilityView {
  revenue: number                 // selling + fee
  knownCosts: number
  costUnavailableCount: number    // lines flagged, never guessed
  projectedMargin: number | null  // null when any cost is unavailable
  marginPct: number | null
}

export function computeProfitability(input: ProfitabilityInput): ProfitabilityView {
  const revenue = round2(input.clientNetSelling + input.procurementFee)
  const unavailable = input.supplierCosts.filter(c => c.total === null || c.total === undefined).length
  const knownCosts = round2(input.supplierCosts.reduce((s, c) => s + (c.total ?? 0), 0))
  const complete = unavailable === 0
  const projectedMargin = complete ? round2(revenue - knownCosts) : null
  const marginPct = complete && revenue > 0 && projectedMargin !== null
    ? Math.round((projectedMargin / revenue) * 1000) / 10
    : null
  return { revenue, knownCosts, costUnavailableCount: unavailable, projectedMargin, marginPct }
}

// ── 9. Workload / exception queue predicates ──────────────────

export function isAllocationMissingCost(a: AllocationRowInput): boolean {
  const live = a.allocation_status !== 'cancelled' && a.allocation_status !== 'superseded'
  return live && (a.supplier_cost_total === null || a.supplier_cost_total === undefined || !a.supplier_currency)
}

export function isPoAwaitingApproval(po: Pick<PoRowInput, 'status' | 'approval_status'>): boolean {
  return po.status === 'pending_approval' || (po.approval_status === 'required' && po.status === 'draft')
}

export function isPoAwaitingIssue(po: Pick<PoRowInput, 'status'>): boolean {
  return po.status === 'approved'
}

export function isPoAwaitingAck(po: Pick<PoRowInput, 'status' | 'acknowledged_at'>): boolean {
  return (po.status === 'issued' || po.status === 'viewed') && !po.acknowledged_at
}

export function isDeliveryToSchedule(d: Pick<DeliveryRowInput, 'dispatch_status' | 'expected_date'>): boolean {
  return d.dispatch_status === 'pending' && !d.expected_date
}

export function isOpenException(e: Pick<ExceptionRowInput, 'resolution_status'>): boolean {
  return e.resolution_status === 'open' || e.resolution_status === 'reordering'
}

// ── 10. Operations settings (stored on commercial_settings) ───

export interface OperationsSettings {
  backorder_flag_days: number
  exposure_alert_percent: number
  stale_order_days: number
}

export const OPERATIONS_SETTINGS_DEFAULTS: OperationsSettings = {
  backorder_flag_days: 14,
  exposure_alert_percent: 50,
  stale_order_days: 30,
}

/** Merge stored settings (possibly partial/null) over the defaults. */
export function resolveOperationsSettings(
  stored: Partial<Record<keyof OperationsSettings, unknown>> | null | undefined,
): OperationsSettings {
  const out = { ...OPERATIONS_SETTINGS_DEFAULTS }
  if (stored) {
    for (const key of Object.keys(out) as (keyof OperationsSettings)[]) {
      const v = Number(stored[key])
      if (Number.isFinite(v) && v > 0) out[key] = v
    }
  }
  return out
}
