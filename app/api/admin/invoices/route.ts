import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/admin/invoices?status=&client=&project= — invoice list
export async function GET(req: NextRequest) {
  const cs = await requireCommercial('invoice_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  const sp = req.nextUrl.searchParams
  let q = supabaseAdmin.from('sales_invoices')
    .select('id, invoice_number, invoice_type, status, currency, gross_total, amount_paid, credit_total, balance_due, due_date, issue_date, client_snapshot, commercial_order_id, created_at')
    .order('created_at', { ascending: false }).limit(500)
  const status = sp.get('status'); if (status) q = q.eq('status', status)
  const client = sp.get('client'); if (client) q = q.eq('client_id', client)
  const project = sp.get('project'); if (project) q = q.eq('project_id', project)
  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: 'Query failed' }, { status: 500 })

  // Derived overdue flag (never overwrites a paid invoice).
  const today = new Date().toISOString().slice(0, 10)
  const rows = (data ?? []).map(i => ({
    ...i,
    overdue: i.status !== 'paid' && i.status !== 'void' && Number(i.balance_due) > 0 && i.due_date && i.due_date < today,
  }))
  return NextResponse.json({ success: true, data: rows })
}
