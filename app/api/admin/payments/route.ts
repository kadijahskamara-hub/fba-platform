import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { recordPayment } from '@/lib/commercial/payments'
import { ValidationError, vUuidOrNull, vNumber, vString, vDate, vEnum } from '@/lib/commercial/validation'

const METHODS = ['bank_transfer', 'card', 'cash', 'cheque', 'credit', 'other'] as const

// GET  /api/admin/payments — list
// POST /api/admin/payments — record a (pending) payment
export async function GET(req: NextRequest) {
  const cs = await requireCommercial('payment_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  let q = supabaseAdmin.from('payments')
    .select('id, payment_reference, client_id, commercial_order_id, currency, amount, payment_date, payment_method, status, created_at')
    .order('created_at', { ascending: false }).limit(500)
  const status = req.nextUrl.searchParams.get('status'); if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: 'Query failed' }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const cs = await requireCommercial('payment_record')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const result = await recordPayment({
      clientId: vUuidOrNull(body.clientId, 'clientId'),
      commercialOrderId: vUuidOrNull(body.commercialOrderId, 'commercialOrderId'),
      amount: vNumber(body.amount, 'amount', { required: true, min: 0.01 })!,
      currency: vString(body.currency, 'currency', { max: 3 }) ?? 'GBP',
      paymentDate: vDate(body.paymentDate, 'paymentDate', true)!,
      paymentMethod: vEnum(body.paymentMethod, 'paymentMethod', METHODS, { required: true })!,
      externalReference: vString(body.externalReference, 'externalReference', { max: 200 }),
      bankReference: vString(body.bankReference, 'bankReference', { max: 200 }),
      notes: vString(body.notes, 'notes', { max: 2000 }),
      actor: cs.user,
    })
    if ('error' in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, data: result.data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
