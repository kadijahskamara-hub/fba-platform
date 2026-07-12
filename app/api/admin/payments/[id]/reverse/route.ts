import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { reversePayment } from '@/lib/commercial/payments'
import { ValidationError, vUuid, vString } from '@/lib/commercial/validation'

// POST /api/admin/payments/:id/reverse { reason } — Finance Admin / Ultra Admin only.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('payment_reverse')
  if (!cs) return NextResponse.json({ success: false, error: 'Reversal requires the payment_reverse permission (Finance Admin / Ultra Admin).' }, { status: 403 })
  try {
    vUuid(params.id, 'id')
    const body = await req.json().catch(() => ({}))
    const reason = vString(body.reason, 'reason', { required: true, max: 500 })!
    const r = await reversePayment({ paymentId: params.id, actor: cs.user, reason })
    if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: r.status })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
