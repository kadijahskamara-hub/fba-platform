import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAnyCommercial } from '@/lib/commercial/permissions'
import {
  isAllocationMissingCost, isPoAwaitingApproval, isPoAwaitingIssue,
  isPoAwaitingAck, isDeliveryToSchedule,
} from '@/lib/commercial/operationsLogic'

// ============================================================
// GET /api/admin/operations/workload  (Sprint 7 A.1.10)
// Open-items queues per staff member + unassigned:
//   allocations missing cost/currency; POs awaiting approval /
//   issue / acknowledgement; deliveries to schedule; open
//   backorders/exceptions; unapproved refunds; unallocated
//   payments; needs_re_export records (Sprint 6).
// Each item links straight to its record.
// ============================================================

export const dynamic = 'force-dynamic'

interface QueueItem {
  queue: string
  label: string
  ownerId: string | null
  href: string
  ref: string
  orderId?: string | null
}

export async function GET() {
  const cs = await requireAnyCommercial(['delivery_view', 'quote_pipeline_view'])
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const [allocations, pos, deliveries, exceptions, refunds, payments, reExport, staff] = await Promise.all([
    supabaseAdmin.from('supplier_allocations')
      .select('id, commercial_order_id, allocation_status, supplier_cost_total, supplier_currency, supplier_sku, created_by')
      .not('allocation_status', 'in', '("cancelled","superseded")').limit(2000),
    supabaseAdmin.from('purchase_orders')
      .select('id, purchase_order_number, commercial_order_id, status, approval_status, acknowledged_at, created_by')
      .not('status', 'in', '("cancelled","received")').limit(2000),
    supabaseAdmin.from('deliveries')
      .select('id, delivery_number, commercial_order_id, dispatch_status, expected_date, created_by')
      .not('dispatch_status', 'in', '("delivered","returned")').limit(2000),
    supabaseAdmin.from('delivery_line_exceptions')
      .select('id, resolution_status, type, created_at, delivery_lines!inner(delivery_id, deliveries!inner(id, delivery_number, commercial_order_id))')
      .in('resolution_status', ['open', 'reordering']).limit(2000),
    supabaseAdmin.from('refunds')
      .select('id, refund_number, status, recorded_by').eq('status', 'pending').limit(2000),
    supabaseAdmin.from('payments')
      .select('id, payment_reference, status, recorded_by, commercial_order_id, payment_allocations(id)')
      .eq('status', 'confirmed').limit(2000),
    Promise.all([
      supabaseAdmin.from('sales_invoices').select('id, invoice_number').eq('reconciliation_status', 'needs_re_export').limit(500),
      supabaseAdmin.from('payments').select('id, payment_reference').eq('reconciliation_status', 'needs_re_export').limit(500),
      supabaseAdmin.from('refunds').select('id, refund_number').eq('reconciliation_status', 'needs_re_export').limit(500),
    ]),
    supabaseAdmin.from('users')
      .select('id, first_name, last_name, email')
      .in('role', ['admin', 'staff']).eq('status', 'active'),
  ])

  const items: QueueItem[] = []

  for (const a of allocations.data ?? []) {
    if (isAllocationMissingCost({
      id: a.id, allocation_status: a.allocation_status,
      supplier_cost_total: a.supplier_cost_total, supplier_currency: a.supplier_currency,
    })) {
      items.push({
        queue: 'allocations_missing_cost', label: 'Allocation missing cost/currency',
        ownerId: a.created_by, ref: a.supplier_sku ?? a.id.slice(0, 8),
        href: `/admin/commercial-orders/${a.commercial_order_id}/procurement`, orderId: a.commercial_order_id,
      })
    }
  }
  for (const p of pos.data ?? []) {
    const base = {
      ownerId: p.created_by as string | null,
      ref: (p.purchase_order_number as string | null) ?? p.id.slice(0, 8),
      href: `/admin/purchase-orders/${p.id}`,
      orderId: p.commercial_order_id as string | null,
    }
    if (isPoAwaitingApproval(p)) items.push({ queue: 'pos_awaiting_approval', label: 'PO awaiting approval', ...base })
    else if (isPoAwaitingIssue(p)) items.push({ queue: 'pos_awaiting_issue', label: 'PO approved, not issued', ...base })
    else if (isPoAwaitingAck(p)) items.push({ queue: 'pos_awaiting_ack', label: 'PO awaiting acknowledgement', ...base })
  }
  for (const d of deliveries.data ?? []) {
    if (isDeliveryToSchedule(d)) {
      items.push({
        queue: 'deliveries_to_schedule', label: 'Delivery to schedule',
        ownerId: d.created_by, ref: d.delivery_number ?? d.id.slice(0, 8),
        href: `/admin/deliveries/${d.id}`, orderId: d.commercial_order_id,
      })
    }
  }
  for (const e of (exceptions.data ?? []) as Record<string, unknown>[]) {
    const line = e.delivery_lines as { deliveries?: { id?: string; delivery_number?: string; commercial_order_id?: string } } | null
    items.push({
      queue: 'open_exceptions', label: `Open exception (${e.type ?? 'issue'})`,
      ownerId: null, ref: line?.deliveries?.delivery_number ?? (e.id as string).slice(0, 8),
      href: `/admin/deliveries/${line?.deliveries?.id ?? ''}`,
      orderId: line?.deliveries?.commercial_order_id ?? null,
    })
  }
  for (const r of refunds.data ?? []) {
    items.push({
      queue: 'refunds_unapproved', label: 'Refund awaiting approval',
      ownerId: r.recorded_by, ref: r.refund_number ?? r.id.slice(0, 8),
      href: '/admin/accounting',
    })
  }
  for (const p of payments.data ?? []) {
    const allocated = ((p as Record<string, unknown>).payment_allocations as { id: string }[] | null) ?? []
    if (allocated.length === 0) {
      items.push({
        queue: 'payments_unallocated', label: 'Confirmed payment not allocated',
        ownerId: p.recorded_by, ref: p.payment_reference ?? p.id.slice(0, 8),
        href: `/admin/payments/${p.id}`, orderId: p.commercial_order_id,
      })
    }
  }
  const [reInv, rePay, reRef] = reExport
  for (const i of reInv.data ?? []) items.push({ queue: 'needs_re_export', label: 'Invoice needs re-export', ownerId: null, ref: i.invoice_number, href: '/admin/accounting' })
  for (const p of rePay.data ?? []) items.push({ queue: 'needs_re_export', label: 'Payment needs re-export', ownerId: null, ref: p.payment_reference, href: '/admin/accounting' })
  for (const r of reRef.data ?? []) items.push({ queue: 'needs_re_export', label: 'Refund needs re-export', ownerId: null, ref: r.refund_number, href: '/admin/accounting' })

  // Group by owner.
  const staffById = new Map((staff.data ?? []).map(s => [s.id, `${s.first_name} ${s.last_name}`.trim() || s.email]))
  const byOwner = new Map<string, { ownerId: string | null; ownerName: string; items: QueueItem[] }>()
  for (const item of items) {
    const key = item.ownerId && staffById.has(item.ownerId) ? item.ownerId : 'unassigned'
    if (!byOwner.has(key)) {
      byOwner.set(key, {
        ownerId: key === 'unassigned' ? null : key,
        ownerName: key === 'unassigned' ? 'Unassigned' : staffById.get(key)!,
        items: [],
      })
    }
    byOwner.get(key)!.items.push(item)
  }

  return NextResponse.json({
    success: true,
    data: {
      totalOpenItems: items.length,
      queues: Array.from(byOwner.values()).sort((a, b) => b.items.length - a.items.length),
    },
  })
}
