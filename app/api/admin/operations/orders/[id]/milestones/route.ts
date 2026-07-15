import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAnyCommercial } from '@/lib/commercial/permissions'
import { fetchOrderChildren, getOperationsSettings, todayIso } from '@/lib/commercial/operations'
import { computeMilestones, orderDelayFlags, deliveryReadiness, isOpenException } from '@/lib/commercial/operationsLogic'
import { vUuid, ValidationError } from '@/lib/commercial/validation'
import type {
  PoRowInput, DeliveryRowInput, InstallationRowInput, ExceptionRowInput,
} from '@/lib/commercial/operationsLogic'

// ============================================================
// GET /api/admin/operations/orders/[id]/milestones
// Derived milestone timeline + delay flags for one order.
// ============================================================

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const cs = await requireAnyCommercial(['delivery_view', 'quote_pipeline_view'])
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const params = await ctx.params
  let orderId: string
  try { orderId = vUuid(params.id, 'id') } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    }
    throw e
  }

  const { data: order } = await supabaseAdmin
    .from('commercial_orders')
    .select('id, order_number, status, accepted_at, updated_at, commercial_snapshot')
    .eq('id', orderId)
    .single()
  if (!order) return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })

  const [children, settings, { data: locations }, { data: paidRows }] = await Promise.all([
    fetchOrderChildren([orderId]),
    getOperationsSettings(),
    supabaseAdmin.from('delivery_locations')
      .select('id, address_line1, postcode, site_contacts(id)')
      .eq('commercial_order_id', orderId),
    supabaseAdmin.from('payments')
      .select('amount').eq('commercial_order_id', orderId).eq('status', 'confirmed'),
  ])
  const pos = (children.pos.get(orderId) ?? []) as PoRowInput[]
  const allocations = children.allocations.get(orderId) ?? []
  const deliveries = (children.deliveries.get(orderId) ?? []) as DeliveryRowInput[]
  const installations = (children.installations.get(orderId) ?? []) as InstallationRowInput[]
  const exceptions = (children.exceptions.get(orderId) ?? []) as ExceptionRowInput[]

  const milestones = computeMilestones({
    order: {
      id: order.id, status: order.status,
      accepted_at: order.accepted_at, updated_at: order.updated_at,
    },
    allocations, pos, deliveries, installations,
  })
  const flags = orderDelayFlags({
    pos, deliveries, installations, exceptions,
    today: todayIso(), backorderStaleDays: settings.backorder_flag_days,
  })

  // Delivery readiness (A.1.7): "ready to book delivery / blocked by X".
  const liveAllocations = allocations.filter(a =>
    !['cancelled', 'superseded'].includes((a as { allocation_status: string }).allocation_status)) as
    { source_line_item_id: string | null }[]
  // Sprint 4 coverage: an allocation line is covered when a delivery line
  // exists for the same source line item.
  const deliveryIds = deliveries.map(d => d.id)
  const coveredLineItems = new Set<string>()
  if (deliveryIds.length > 0) {
    const { data: dLines } = await supabaseAdmin
      .from('delivery_lines')
      .select('source_line_item_id')
      .in('delivery_id', deliveryIds)
    for (const l of dLines ?? []) {
      const src = (l as { source_line_item_id: string | null }).source_line_item_id
      if (src) coveredLineItems.add(src)
    }
  }
  const outstandingLines = liveAllocations
    .filter(a => !a.source_line_item_id || !coveredLineItems.has(a.source_line_item_id)).length

  const totals = ((order.commercial_snapshot as { totals?: { depositRequested?: number | null } } | null)?.totals) ?? {}
  const paidConfirmed = (paidRows ?? []).reduce((s, p) => s + Number((p as { amount: number | null }).amount ?? 0), 0)
  const depositRequested = Number(totals.depositRequested ?? 0)
  const locs = (locations ?? []) as { address_line1: string | null; postcode: string | null; site_contacts: { id: string }[] | null }[]
  const readiness = deliveryReadiness({
    outstandingLines,
    hasSiteAddress: locs.some(l => Boolean(l.address_line1 && l.postcode)),
    hasSiteContact: locs.some(l => (l.site_contacts ?? []).length > 0),
    depositSatisfied: depositRequested === 0 || paidConfirmed >= depositRequested,
    openExceptions: exceptions.filter(isOpenException).length,
  })

  return NextResponse.json({
    success: true,
    data: { orderNumber: order.order_number, status: order.status, milestones, flags, readiness },
  })
}
