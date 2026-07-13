import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial, requireAnyCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { recordRefund } from '@/lib/commercial/refunds'
import { vUuidOrNull, vNumber, vDate, vEnum, vString, ValidationError } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// GET — list refunds (accounting_view / refund_record / refund_approve).
export async function GET(req: NextRequest) {
  const cs = await requireAnyCommercial(['accounting_view', 'refund_record', 'refund_approve'])
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  let q = supabaseAdmin.from('refunds')
    .select('id, refund_number, payment_id, credit_note_id, sales_invoice_id, amount, currency, refund_date, method, status, reconciliation_status, created_at')
    .order('created_at', { ascending: false }).limit(200)
  const status = req.nextUrl.searchParams.get('status')
  if (status) q = q.eq('status', status)
  const { data } = await q
  return NextResponse.json({ refunds: data ?? [] })
}

// POST — record a refund (refund_record). Approval is separate & Ultra-only.
export async function POST(req: NextRequest) {
  const cs = await requireCommercial('refund_record')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const paymentId = vUuidOrNull(body.paymentId, 'paymentId')
    const creditNoteId = vUuidOrNull(body.creditNoteId, 'creditNoteId')
    if ((paymentId === null) === (creditNoteId === null)) throw new ValidationError('Provide exactly one source: paymentId or creditNoteId')
    const amount = vNumber(body.amount, 'amount', { required: true, min: 0.01 })!
    const refundDate = vDate(body.refundDate, 'refundDate')
    const method = vEnum(body.method, 'method', ['bank_transfer', 'card', 'cash', 'other'] as const) ?? 'bank_transfer'
    const externalReference = vString(body.externalReference, 'externalReference', { max: 200 })
    const reason = vString(body.reason, 'reason', { max: 2000 })
    const res = await recordRefund({ paymentId, creditNoteId, amount, refundDate, method, externalReference, reason, actor: cs.user })
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ refundNumber: res.data.refundNumber }, { status: 201 })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
