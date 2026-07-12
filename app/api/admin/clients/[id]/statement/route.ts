import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { renderStatement, StatementRow } from '@/lib/commercial/invoiceDocuments'
import { isOverdue } from '@/lib/commercial/invoiceCalculations'

// GET /api/admin/clients/:id/statement?from=&to=&format=json|html
// Client account statement: invoices, payments, credits, running balance.
// No supplier or margin data is exposed.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('invoice_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  const sp = req.nextUrl.searchParams
  const from = sp.get('from'); const to = sp.get('to')
  const today = new Date().toISOString().slice(0, 10)

  let invQ = supabaseAdmin.from('sales_invoices')
    .select('id, invoice_number, invoice_type, status, currency, gross_total, amount_paid, credit_total, balance_due, issue_date, due_date, locked_at, client_snapshot')
    .eq('client_id', params.id).not('status', 'in', '(draft,void,cancelled)')
    .order('issue_date', { ascending: true })
  if (from) invQ = invQ.gte('issue_date', from)
  if (to) invQ = invQ.lte('issue_date', to)
  const { data: invoices } = await invQ

  const currency = (invoices?.[0]?.currency as string) ?? 'GBP'
  const clientName = ((invoices?.[0]?.client_snapshot as Record<string, unknown> | null)?.company
    || (invoices?.[0]?.client_snapshot as Record<string, unknown> | null)?.name || 'Client') as string

  // Payment allocations against this client's invoices (confirmed only).
  type AllocRow = {
    amount: number; allocated_at: string; sales_invoice_id: string
    payment: { payment_reference: string; status: string; payment_date: string } | null
  }
  const invIds = (invoices ?? []).map(i => i.id)
  let allocations: AllocRow[] = []
  if (invIds.length) {
    const { data } = await supabaseAdmin
      .from('payment_allocations')
      .select('amount, allocated_at, sales_invoice_id, payment:payments(payment_reference, status, payment_date)')
      .in('sales_invoice_id', invIds)
    allocations = ((data ?? []) as unknown as AllocRow[]).filter(a => a.payment?.status === 'confirmed')
  }

  const events: Array<{ date: string; type: string; reference: string; charge: number; paid: number }> = []
  for (const i of invoices ?? []) {
    events.push({ date: (i.issue_date as string) ?? today, type: `Invoice (${i.invoice_type})`, reference: (i.invoice_number as string) ?? '—', charge: Number(i.gross_total ?? 0), paid: 0 })
  }
  for (const a of allocations) {
    const p = a.payment
    events.push({ date: p?.payment_date ?? (a.allocated_at ?? '').slice(0, 10), type: 'Payment', reference: p?.payment_reference ?? '—', charge: 0, paid: Number(a.amount ?? 0) })
  }
  events.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))

  let bal = 0
  const rows: StatementRow[] = events.map(e => { bal += e.charge - e.paid; return { ...e, balance: bal } })

  const totals = {
    invoiced: (invoices ?? []).reduce((s, i) => s + Number(i.gross_total ?? 0), 0),
    paid: (invoices ?? []).reduce((s, i) => s + Number(i.amount_paid ?? 0), 0),
    credited: (invoices ?? []).reduce((s, i) => s + Number(i.credit_total ?? 0), 0),
    outstanding: (invoices ?? []).reduce((s, i) => s + Number(i.balance_due ?? 0), 0),
    overdue: (invoices ?? []).reduce((s, i) =>
      s + (isOverdue({ locked: Boolean(i.locked_at), balanceDue: Number(i.balance_due ?? 0), dueDate: (i.due_date as string) ?? null, today }) ? Number(i.balance_due ?? 0) : 0), 0),
  }

  if (sp.get('format') === 'html') {
    const html = renderStatement({ clientName, currency, rows, totals })
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json({ success: true, data: { clientName, currency, rows, totals } })
}
