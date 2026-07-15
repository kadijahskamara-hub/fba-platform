import { NextResponse } from 'next/server'
import { requireAnyCommercial, hasPermission } from '@/lib/commercial/permissions'
import { buildOverview, maskOverviewMoney } from '@/lib/commercial/operations'
import { OPERATIONS_LANES, LANE_LABELS } from '@/lib/commercial/operationsLogic'

// ============================================================
// GET /api/admin/operations/overview  (Sprint 7 Part A)
// KPI cards + pipeline lanes + the needs-attention list.
// Operational permission: delivery_view OR quote_pipeline_view.
// Money figures require quote_price_edit (masked otherwise).
// ============================================================

export const dynamic = 'force-dynamic'

export async function GET() {
  const cs = await requireAnyCommercial(['delivery_view', 'quote_pipeline_view'])
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const { orders, settings, today } = await buildOverview()
  const canSeeMoney = hasPermission(cs, 'quote_price_edit')
  const visible = canSeeMoney ? orders : maskOverviewMoney(orders)

  const lanes = OPERATIONS_LANES.map(lane => ({
    lane,
    label: LANE_LABELS[lane],
    orders: visible.filter(o => o.lane === lane),
  }))
  const needsAttention = visible
    .filter(o => o.flags.length > 0)
    .sort((a, b) => b.flags.length - a.flags.length)

  const kpis = {
    liveOrders: visible.filter(o => !['closed', 'cancelled', 'pre_acceptance'].includes(o.lane)).length,
    flaggedOrders: needsAttention.length,
    posAwaitingAck: visible.reduce((s, o) => s + o.poAwaitingAck, 0),
    posAwaitingApproval: visible.reduce((s, o) => s + o.poAwaitingApproval, 0),
    deliveriesOpen: visible.reduce((s, o) => s + o.deliveriesOpen, 0),
    marginAtRiskUnresolved: visible.reduce((s, o) => s + o.marginAtRiskUnresolved, 0),
    netExposure: canSeeMoney
      ? Math.round(visible.reduce((s, o) => s + (o.netExposure ?? 0), 0) * 100) / 100
      : null,
  }

  return NextResponse.json({
    success: true,
    data: { kpis, lanes, needsAttention, settings, today, canSeeMoney },
  })
}
