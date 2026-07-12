import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { confirmPayment, issueReceipt } from '@/lib/commercial/payments'
import { ValidationError, vUuid, vBoolean } from '@/lib/commercial/validation'

// GET  /api/admin/payments/:id — detail + allocations
// POST /api/admin/payments/:id { action:'confirm'|'receipt', overrideBackdate? }
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('payment_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }
  const { data: payment } = await supabaseAdmin.from('payments').select('*').eq('id', params.id).single()
  if (!payment) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  const { data: allocations } = await supabaseAdmin
    .from('payment_allocations').select('*, invoice:sales_invoices(invoice_number, gross_total, balance_due, currency)')
    .eq('payment_id', params.id)
  const { data: receipt } = await supabaseAdmin.from('payment_receipts').select('receipt_number, issued_at').eq('payment_id', params.id).maybeSingle()
  const allocated = (allocations ?? []).reduce((s, a) => s + Number(a.amount ?? 0), 0)
  return NextResponse.json({ success: true, data: { payment, allocations: allocations ?? [], receipt, unallocated: Number(payment.amount) - allocated } })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  try {
    vUuid(params.id, 'id')
    const body = await req.json().catch(() => ({}))
    if (body.action === 'confirm') {
      const cs = await requireCommercial('payment_confirm')
      if (!cs) return NextResponse.json({ success: false, error: 'Confirming payments requires the payment_confirm permission.' }, { status: 403 })
      const r = await confirmPayment({ paymentId: params.id, actor: cs.user, isUltraAdmin: cs.isUltraAdmin, overrideBackdate: vBoolean(body.overrideBackdate, 'overrideBackdate', false) ?? false })
      if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: r.status })
      return NextResponse.json({ success: true })
    }
    if (body.action === 'receipt') {
      const cs = await requireCommercial('payment_view')
      if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      const r = await issueReceipt(params.id, cs.user)
      if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: r.status })
      return NextResponse.json({ success: true, data: r.data })
    }
    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
