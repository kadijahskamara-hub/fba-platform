import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { buildInvoiceSnapshot } from '@/lib/commercial/invoices'
import { renderInvoiceDocument } from '@/lib/commercial/invoiceDocuments'
import { logAudit } from '@/lib/audit'

// GET /api/admin/invoices/:id/document — render the invoice.
// Issued invoices render ONLY from their frozen snapshot; drafts render a
// live preview. Client selling values only (no supplier cost / margin).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('invoice_view')
  if (!cs) return new NextResponse('Forbidden', { status: 403 })

  const { data: inv } = await supabaseAdmin.from('sales_invoices').select('*').eq('id', params.id).single()
  if (!inv) return new NextResponse('Not found', { status: 404 })

  let snapshot: Record<string, unknown> | null
  if (inv.locked_at) {
    const { data: snap } = await supabaseAdmin.from('sales_invoice_snapshots').select('snapshot').eq('sales_invoice_id', params.id).single()
    snapshot = (snap?.snapshot as Record<string, unknown>) ?? null
  } else {
    snapshot = await buildInvoiceSnapshot(params.id)
  }
  if (!snapshot) return new NextResponse('Document unavailable', { status: 404 })

  const html = renderInvoiceDocument(snapshot, {
    amountPaid: Number(inv.amount_paid ?? 0), creditTotal: Number(inv.credit_total ?? 0), balanceDue: Number(inv.balance_due ?? 0),
  })
  if (inv.locked_at) {
    await logAudit({ actor: cs.user, action: 'commercial.invoice_downloaded', entityType: 'sales_invoice', entityId: params.id, after: { invoiceNumber: inv.invoice_number } })
  }
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
