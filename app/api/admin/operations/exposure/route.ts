import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { getOperationsSettings } from '@/lib/commercial/operations'
import { toCsv } from '@/lib/commercial/accountingLogic'

// ============================================================
// GET /api/admin/operations/exposure[?format=csv]
// Client payment vs supplier commitment, per order + portfolio.
// PRICE-LEVEL data: requires quote_price_edit.
// ============================================================

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cs = await requireCommercial('quote_price_edit')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const settings = await getOperationsSettings()
  const { data: rows } = await supabaseAdmin
    .from('vw_order_exposure')
    .select('*')
    .not('status', 'in', '("draft","pending_acceptance","cancelled")')
    .order('net_exposure', { ascending: false })
    .limit(500)

  const orders = ((rows ?? []) as Record<string, unknown>[]).map(r => {
    const committed = Number(r.supplier_committed ?? 0)
    const exposure = Number(r.net_exposure ?? 0)
    const pct = committed > 0 ? Math.round((exposure / committed) * 1000) / 10 : null
    return {
      id: r.id as string,
      orderNumber: r.order_number as string,
      status: r.status as string,
      currency: r.currency as string,
      clientCompany: (r.client_company as string | null) ?? null,
      clientInvoiced: Number(r.client_invoiced ?? 0),
      clientPaidConfirmed: Number(r.client_paid_confirmed ?? 0),
      supplierCommitted: committed,
      supplierUncommitted: Number(r.supplier_uncommitted ?? 0),
      netExposure: exposure,
      exposurePct: pct,
      breachesThreshold: pct !== null && pct >= settings.exposure_alert_percent,
    }
  })

  const portfolio = {
    clientInvoiced: sum(orders.map(o => o.clientInvoiced)),
    clientPaidConfirmed: sum(orders.map(o => o.clientPaidConfirmed)),
    supplierCommitted: sum(orders.map(o => o.supplierCommitted)),
    supplierUncommitted: sum(orders.map(o => o.supplierUncommitted)),
    netExposure: sum(orders.map(o => o.netExposure)),
    breaches: orders.filter(o => o.breachesThreshold).length,
    alertPercent: settings.exposure_alert_percent,
  }

  if (req.nextUrl.searchParams.get('format') === 'csv') {
    const csv = toCsv(
      ['Order', 'Client', 'Status', 'Currency', 'Invoiced', 'Paid (confirmed)',
       'Supplier committed', 'Supplier still-to-commit', 'Net exposure', 'Exposure %', 'Breaches threshold'],
      orders.map(o => [
        o.orderNumber, o.clientCompany, o.status, o.currency, o.clientInvoiced,
        o.clientPaidConfirmed, o.supplierCommitted, o.supplierUncommitted,
        o.netExposure, o.exposurePct ?? '', o.breachesThreshold ? 'YES' : '',
      ]),
    )
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="exposure-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  return NextResponse.json({ success: true, data: { orders, portfolio } })
}

const sum = (ns: number[]) => Math.round(ns.reduce((a, b) => a + b, 0) * 100) / 100
