import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { createDraftCreditNote } from '@/lib/commercial/creditNotes'
import { ValidationError, vUuid, vString, vNumber } from '@/lib/commercial/validation'

// GET  /api/admin/credit-notes?invoice= — list
// POST /api/admin/credit-notes { invoiceId, reason, amount } — draft credit note
export async function GET(req: NextRequest) {
  const cs = await requireCommercial('invoice_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  let q = supabaseAdmin.from('credit_notes')
    .select('id, credit_note_number, sales_invoice_id, status, currency, gross_total, allocated_total, reason, created_at')
    .order('created_at', { ascending: false }).limit(500)
  const inv = req.nextUrl.searchParams.get('invoice'); if (inv) q = q.eq('sales_invoice_id', inv)
  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: 'Query failed' }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const cs = await requireCommercial('credit_note_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const r = await createDraftCreditNote({
      invoiceId: vUuid(body.invoiceId, 'invoiceId'),
      reason: vString(body.reason, 'reason', { required: true, max: 2000 })!,
      amount: vNumber(body.amount, 'amount', { min: 0.01 }),
      actor: cs.user,
    })
    if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: r.status })
    return NextResponse.json({ success: true, data: r.data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
