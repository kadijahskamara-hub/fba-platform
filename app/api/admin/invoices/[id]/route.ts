import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { recalcInvoice, voidInvoice } from '@/lib/commercial/invoices'
import { ValidationError, vUuid, vString } from '@/lib/commercial/validation'

// GET    /api/admin/invoices/:id           — invoice detail (lines, payments, credits)
// POST   /api/admin/invoices/:id  {action:'recalc'|'approve'|'void', reason?}
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('invoice_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }

  const { data: invoice } = await supabaseAdmin.from('sales_invoices').select('*').eq('id', params.id).single()
  if (!invoice) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  const { data: lines } = await supabaseAdmin.from('sales_invoice_lines').select('*').eq('sales_invoice_id', params.id).order('sort_order')
  const { data: allocations } = await supabaseAdmin
    .from('payment_allocations').select('*, payment:payments(payment_reference, status, payment_method, payment_date)')
    .eq('sales_invoice_id', params.id)
  const { data: credits } = await supabaseAdmin
    .from('credit_note_allocations').select('*, credit_note:credit_notes(credit_note_number, status)')
    .eq('sales_invoice_id', params.id)
  return NextResponse.json({ success: true, data: { invoice, lines: lines ?? [], allocations: allocations ?? [], credits: credits ?? [] } })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  try {
    vUuid(params.id, 'id')
    const body = await req.json().catch(() => ({}))
    const action = body.action

    if (action === 'recalc') {
      const cs = await requireCommercial('invoice_create')
      if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      const r = await recalcInvoice(params.id)
      if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: r.status })
      return NextResponse.json({ success: true, data: r.data })
    }
    if (action === 'approve') {
      const cs = await requireCommercial('invoice_approve')
      if (!cs) return NextResponse.json({ success: false, error: 'Invoice approval requires the invoice_approve permission.' }, { status: 403 })
      await supabaseAdmin.from('sales_invoices').update({ approval_status: 'approved', approved_by: cs.user.id, approved_at: new Date().toISOString() }).eq('id', params.id).is('locked_at', null)
      return NextResponse.json({ success: true })
    }
    if (action === 'void') {
      const cs = await requireCommercial('invoice_issue')
      if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      const reason = vString(body.reason, 'reason', { required: true, max: 500 })!
      const r = await voidInvoice(params.id, cs.user, reason)
      if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: r.status })
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
