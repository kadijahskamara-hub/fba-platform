import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { computeProfitability } from '@/lib/commercial/operationsLogic'
import { toCsv } from '@/lib/commercial/accountingLogic'
import type { OrderSnapshotTotals } from '@/lib/commercial/operations'

// ============================================================
// GET /api/admin/operations/profitability[?format=csv]
// Per-order projected/settled margin: client net selling
// (+ procurement fee) minus supplier costs. Cost-unavailable
// lines are flagged and NEVER guessed — such orders report a
// null margin. PRICE-LEVEL data: requires quote_price_edit.
// ============================================================

export const dynamic = 'force-dynamic'

const SETTLED_STATUSES = new Set(['completed'])
const COMMITTED_PO = new Set([
  'issued', 'viewed', 'acknowledged', 'supplier_amendment_requested', 'revised',
  'confirmed', 'in_production', 'ready_for_dispatch', 'dispatched',
  'partially_received', 'received',
])

export async function GET(req: NextRequest) {
  const cs = await requireCommercial('quote_price_edit')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const [{ data: orders }, { data: pos }, { data: allocations }] = await Promise.all([
    supabaseAdmin.from('commercial_orders')
      .select('id, order_number, status, currency, client_snapshot, commercial_snapshot')
      .not('status', 'in', '("draft","pending_acceptance","cancelled")')
      .limit(500),
    supabaseAdmin.from('purchase_orders')
      .select('id, commercial_order_id, status, grand_total')
      .limit(5000),
    supabaseAdmin.from('supplier_allocations')
      .select('id, commercial_order_id, allocation_status, supplier_cost_total')
      .limit(5000),
  ])

  const posByOrder = groupBy(pos ?? [], 'commercial_order_id')
  const allocByOrder = groupBy(allocations ?? [], 'commercial_order_id')

  const rows = ((orders ?? []) as Record<string, unknown>[]).map(o => {
    const id = o.id as string
    const totals = ((o.commercial_snapshot as { totals?: OrderSnapshotTotals } | null)?.totals) ?? {}
    const orderPos = (posByOrder.get(id) ?? []).filter(p => COMMITTED_PO.has(p.status as string))
    // Costs: committed PO actuals + live allocations not yet on a committed PO.
    const looseAllocs = (allocByOrder.get(id) ?? []).filter(a =>
      ['unallocated', 'allocated', 'ready_for_po'].includes(a.allocation_status as string))
    const supplierCosts = [
      ...orderPos.map(p => ({ total: p.grand_total === null ? null : Number(p.grand_total) })),
      ...looseAllocs.map(a => ({ total: a.supplier_cost_total === null ? null : Number(a.supplier_cost_total) })),
    ]
    const sellingKnown = totals.netSubtotal !== null && totals.netSubtotal !== undefined
    const view = computeProfitability({
      clientNetSelling: Number(totals.netSubtotal ?? 0),
      procurementFee: Number(totals.procurementFee ?? 0),
      supplierCosts,
    })
    return {
      id,
      orderNumber: o.order_number as string,
      status: o.status as string,
      currency: o.currency as string,
      clientCompany: ((o.client_snapshot as Record<string, unknown> | null)?.company_name as string | null) ?? null,
      settled: SETTLED_STATUSES.has(o.status as string),
      sellingKnown,
      revenue: sellingKnown ? view.revenue : null,
      knownCosts: view.knownCosts,
      costUnavailableCount: view.costUnavailableCount,
      projectedMargin: sellingKnown ? view.projectedMargin : null,
      marginPct: sellingKnown ? view.marginPct : null,
    }
  }).sort((a, b) => (b.marginPct ?? -Infinity) - (a.marginPct ?? -Infinity))

  if (req.nextUrl.searchParams.get('format') === 'csv') {
    const csv = toCsv(
      ['Order', 'Client', 'Status', 'Settled?', 'Currency', 'Revenue (net + fee)',
       'Known costs', 'Cost-unavailable lines', 'Margin', 'Margin %'],
      rows.map(r => [
        r.orderNumber, r.clientCompany, r.status, r.settled ? 'YES' : '', r.currency,
        r.revenue ?? 'unknown', r.knownCosts, r.costUnavailableCount,
        r.projectedMargin ?? 'incomplete costs', r.marginPct ?? '',
      ]),
    )
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="profitability-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  return NextResponse.json({ success: true, data: { orders: rows } })
}

function groupBy(rows: Record<string, unknown>[], key: string): Map<string, Record<string, unknown>[]> {
  const map = new Map<string, Record<string, unknown>[]>()
  for (const r of rows) {
    const k = (r[key] as string | null) ?? ''
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(r)
  }
  return map
}
