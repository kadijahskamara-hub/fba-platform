import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { allocatePayment, removeAllocation } from '@/lib/commercial/payments'
import { ValidationError, vUuid, vNumber } from '@/lib/commercial/validation'

// POST   /api/admin/payments/:id/allocate { invoiceId, amount }
// DELETE /api/admin/payments/:id/allocate { allocationId }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('payment_allocate')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.id, 'id')
    const body = await req.json().catch(() => ({}))
    const invoiceId = vUuid(body.invoiceId, 'invoiceId')
    const amount = vNumber(body.amount, 'amount', { required: true, min: 0.01 })!
    const r = await allocatePayment({ paymentId: params.id, invoiceId, amount, actor: cs.user })
    if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: r.status })
    return NextResponse.json({ success: true, data: r.data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('payment_allocate')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.id, 'id')
    const body = await req.json().catch(() => ({}))
    const allocationId = vUuid(body.allocationId, 'allocationId')
    const r = await removeAllocation(allocationId, cs.user)
    if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: r.status })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
