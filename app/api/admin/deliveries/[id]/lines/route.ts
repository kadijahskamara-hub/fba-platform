import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { assignDeliveryLine, isErr } from '@/lib/commercial/deliveries'
import { ValidationError, vUuid, vString, vNumber } from '@/lib/commercial/validation'

// POST /api/admin/deliveries/:id/lines — assign an order line
// (partial quantities supported; remainder auto-flags as backorder).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')
    const body = await req.json()
    const result = await assignDeliveryLine({
      deliveryId: params.id,
      sourceLineItemId: vUuid(body.sourceLineItemId, 'sourceLineItemId'),
      quantity: vNumber(body.quantity, 'quantity', { min: 0.001, max: 1000000, required: true })!,
      notes: vString(body.notes, 'notes', { max: 1000 }),
      actor: cs.user,
    })
    if (isErr(result)) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, data: result.data })
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Could not add the line.' }, { status: 500 })
  }
}
