import 'server-only'
import { supabaseAdmin } from '../supabase'
import { getCommercialSettings } from './settings'
import {
  resolveOperationsSettings, type OperationsSettings,
  deriveOrderLane, daysInStage, computeMilestones, orderDelayFlags,
  computeExposure, computeOrderMargin, computeProfitability, deliveryReadiness,
  computeLeadTimeStats,
  type OrderRowInput, type PoRowInput, type AllocationRowInput,
  type DeliveryRowInput, type InstallationRowInput, type ExceptionRowInput,
  type DelayFlag, type OperationsLane, type LeadTimeEntry,
} from './operationsLogic'

// ============================================================
// Operations dashboard data assembly (Sprint 7 Part A).
// Fetches rows via the service role (RLS: service-role only) and
// runs them through the pure, unit-tested rules in
// operationsLogic.ts. Internal money figures are stripped by the
// API layer for callers without price-level permission.
// ============================================================

export interface OrderSnapshotTotals {
  netSubtotal?: number | null
  grossTotal?: number | null
  procurementFee?: number | null
  depositRequested?: number | null
  productCostSubtotal?: number | null
  costIncomplete?: boolean | null
}

export async function getOperationsSettings(): Promise<OperationsSettings> {
  const settings = await getCommercialSettings()
  return resolveOperationsSettings(settings as unknown as Record<string, unknown>)
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** All operational child rows for a set of orders (or every live order). */
export async function fetchOrderChildren(orderIds: string[]) {
  const [pos, allocations, deliveries, installations, exceptions] = await Promise.all([
    supabaseAdmin.from('purchase_orders')
      .select('id, purchase_order_number, commercial_order_id, manufacturer_id, status, approval_status, acknowledgement_due_date, acknowledged_at, required_by_date, expected_completion_date, issued_at, grand_total, margin_at_risk, margin_resolution')
      .in('commercial_order_id', orderIds),
    supabaseAdmin.from('supplier_allocations')
      .select('id, commercial_order_id, source_line_item_id, allocation_status, supplier_cost_total, supplier_currency')
      .in('commercial_order_id', orderIds),
    supabaseAdmin.from('deliveries')
      .select('id, delivery_number, commercial_order_id, dispatch_status, expected_date, dispatched_at, delivered_at, delivery_location_id')
      .in('commercial_order_id', orderIds),
    supabaseAdmin.from('installations')
      .select('id, commercial_order_id, status, scheduled_date, signed_off_at')
      .in('commercial_order_id', orderIds),
    supabaseAdmin.from('delivery_line_exceptions')
      .select('id, resolution_status, created_at, type, delivery_lines!inner(delivery_id, deliveries!inner(id, commercial_order_id))')
      .in('delivery_lines.deliveries.commercial_order_id', orderIds),
  ])

  const byOrder = <T extends { commercial_order_id?: string | null }>(rows: T[] | null) => {
    const map = new Map<string, T[]>()
    for (const r of rows ?? []) {
      const key = r.commercial_order_id ?? ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return map
  }

  // Exceptions carry their order id through the nested join.
  const exceptionRows = (exceptions.data ?? []).map((e: Record<string, unknown>) => {
    const line = e.delivery_lines as { deliveries?: { commercial_order_id?: string } } | null
    return {
      id: e.id as string,
      resolution_status: e.resolution_status as string,
      created_at: e.created_at as string,
      commercial_order_id: line?.deliveries?.commercial_order_id ?? null,
    }
  })

  return {
    pos: byOrder(pos.data as (PoRowInput & { commercial_order_id: string })[] | null),
    allocations: byOrder(allocations.data as (AllocationRowInput & { commercial_order_id: string; source_line_item_id: string | null })[] | null),
    deliveries: byOrder(deliveries.data as (DeliveryRowInput & { commercial_order_id: string; delivery_location_id: string | null })[] | null),
    installations: byOrder(installations.data as (InstallationRowInput & { commercial_order_id: string })[] | null),
    exceptions: byOrder(exceptionRows as (ExceptionRowInput & { commercial_order_id: string | null })[]),
  }
}

export interface OverviewOrder {
  id: string
  orderNumber: string
  status: string
  lane: OperationsLane
  clientCompany: string | null
  clientName: string | null
  currency: string
  daysInStage: number
  flags: DelayFlag[]
  poCount: number
  poAwaitingAck: number
  poAwaitingApproval: number
  deliveriesOpen: number
  installationsOutstanding: number
  marginAtRiskUnresolved: number
  allocationsMissingCost: number
  // Price-level fields (stripped for viewers without quote_price_edit)
  sellingTotal: number | null
  supplierCommitted: number | null
  clientInvoiced: number | null
  clientPaidConfirmed: number | null
  netExposure: number | null
}

export async function buildOverview(): Promise<{
  orders: OverviewOrder[]
  settings: OperationsSettings
  today: string
}> {
  const settings = await getOperationsSettings()
  const today = todayIso()

  const { data: viewRows } = await supabaseAdmin
    .from('vw_order_operations')
    .select('*')
    .not('status', 'in', '("draft","pending_acceptance")')
    .order('updated_at', { ascending: false })
    .limit(500)

  const rows = (viewRows ?? []) as Record<string, unknown>[]
  const ids = rows.map(r => r.id as string)
  if (ids.length === 0) return { orders: [], settings, today }

  const children = await fetchOrderChildren(ids)

  // Order snapshots for selling totals (price-level field).
  const { data: snapRows } = await supabaseAdmin
    .from('commercial_orders')
    .select('id, commercial_snapshot')
    .in('id', ids)
  const snapshots = new Map<string, OrderSnapshotTotals>()
  for (const s of snapRows ?? []) {
    const totals = ((s as Record<string, unknown>).commercial_snapshot as { totals?: OrderSnapshotTotals } | null)?.totals
    snapshots.set((s as Record<string, unknown>).id as string, totals ?? {})
  }

  const orders: OverviewOrder[] = rows.map(r => {
    const id = r.id as string
    const pos = (children.pos.get(id) ?? []) as PoRowInput[]
    const deliveries = (children.deliveries.get(id) ?? []) as DeliveryRowInput[]
    const installations = (children.installations.get(id) ?? []) as InstallationRowInput[]
    const exceptions = (children.exceptions.get(id) ?? []) as ExceptionRowInput[]
    const orderRow: OrderRowInput = {
      id,
      status: r.status as string,
      accepted_at: (r.accepted_at as string | null) ?? null,
      updated_at: r.updated_at as string,
    }
    const totals = snapshots.get(id) ?? {}
    const committed = Number(r.supplier_committed_total ?? 0)
    const paid = Number(r.client_paid_confirmed_total ?? 0)

    return {
      id,
      orderNumber: r.order_number as string,
      status: r.status as string,
      lane: deriveOrderLane(orderRow, pos, deliveries, installations),
      clientCompany: (r.client_company as string | null) ?? null,
      clientName: (r.client_name as string | null) ?? null,
      currency: r.currency as string,
      daysInStage: daysInStage(orderRow, today),
      flags: orderDelayFlags({
        pos, deliveries, installations, exceptions,
        today, backorderStaleDays: settings.backorder_flag_days,
      }),
      poCount: Number(r.po_count ?? 0),
      poAwaitingAck: Number(r.po_awaiting_ack ?? 0),
      poAwaitingApproval: Number(r.po_awaiting_approval ?? 0),
      deliveriesOpen: Number(r.deliveries_open ?? 0),
      installationsOutstanding: Number(r.installations_required ?? 0) - Number(r.installations_completed ?? 0),
      marginAtRiskUnresolved: Number(r.po_margin_at_risk_unresolved ?? 0),
      allocationsMissingCost: Number(r.allocations_missing_cost ?? 0),
      sellingTotal: totals.netSubtotal ?? null,
      supplierCommitted: committed,
      clientInvoiced: Number(r.client_invoiced_total ?? 0),
      clientPaidConfirmed: paid,
      netExposure: Math.max(0, committed - paid),
    }
  })

  return { orders, settings, today }
}

/** Strip price-level figures for viewers without quote_price_edit. */
export function maskOverviewMoney(orders: OverviewOrder[]): OverviewOrder[] {
  return orders.map(o => ({
    ...o,
    sellingTotal: null,
    supplierCommitted: null,
    clientInvoiced: null,
    clientPaidConfirmed: null,
    netExposure: null,
  }))
}

export {
  computeMilestones, computeExposure, computeOrderMargin,
  computeProfitability, deliveryReadiness, computeLeadTimeStats,
  type LeadTimeEntry,
}
