import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAnyCommercial } from '@/lib/commercial/permissions'
import { getOperationsSettings, todayIso } from '@/lib/commercial/operations'
import { daysBetween } from '@/lib/commercial/operationsLogic'
import { toCsv } from '@/lib/commercial/accountingLogic'

// ============================================================
// GET /api/admin/operations/exceptions[?format=csv]
// Flat exception report: open delivery exceptions/backorders with
// age against the backorder_flag_days setting. Printable/CSV like
// the Sprint 6 reports.
// ============================================================

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cs = await requireAnyCommercial(['delivery_view', 'quote_pipeline_view'])
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const [settings, { data: rows }] = await Promise.all([
    getOperationsSettings(),
    supabaseAdmin.from('delivery_line_exceptions')
      .select('id, type, quantity_affected, notes, resolution_status, resolution_notes, created_at, delivery_lines!inner(delivery_id, deliveries!inner(id, delivery_number, commercial_order_id, commercial_orders!inner(id, order_number)))')
      .order('created_at', { ascending: true })
      .limit(2000),
  ])
  const today = todayIso()

  const exceptions = ((rows ?? []) as Record<string, unknown>[]).map(e => {
    const line = e.delivery_lines as {
      deliveries?: { id?: string; delivery_number?: string; commercial_orders?: { order_number?: string } }
    } | null
    const ageDays = daysBetween(e.created_at as string, today)
    const open = e.resolution_status === 'open' || e.resolution_status === 'reordering'
    return {
      id: e.id as string,
      type: e.type as string,
      quantityAffected: e.quantity_affected,
      resolutionStatus: e.resolution_status as string,
      notes: (e.notes as string | null) ?? null,
      resolutionNotes: (e.resolution_notes as string | null) ?? null,
      createdAt: e.created_at as string,
      ageDays,
      stale: open && ageDays > settings.backorder_flag_days,
      deliveryId: line?.deliveries?.id ?? null,
      deliveryNumber: line?.deliveries?.delivery_number ?? null,
      orderNumber: line?.deliveries?.commercial_orders?.order_number ?? null,
    }
  })

  if (req.nextUrl.searchParams.get('format') === 'csv') {
    const csv = toCsv(
      ['Order', 'Delivery', 'Type', 'Qty affected', 'Status', 'Raised', 'Age (days)',
       `Stale (> ${settings.backorder_flag_days}d)`, 'Notes', 'Resolution notes'],
      exceptions.map(x => [
        x.orderNumber, x.deliveryNumber, x.type, x.quantityAffected, x.resolutionStatus,
        x.createdAt?.slice(0, 10), x.ageDays, x.stale ? 'YES' : '', x.notes, x.resolutionNotes,
      ]),
    )
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="exceptions-${today}.csv"`,
      },
    })
  }

  return NextResponse.json({
    success: true,
    data: {
      exceptions,
      open: exceptions.filter(x => x.resolutionStatus === 'open' || x.resolutionStatus === 'reordering').length,
      stale: exceptions.filter(x => x.stale).length,
      staleThresholdDays: settings.backorder_flag_days,
    },
  })
}
