import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { dispatchDelivery, isErr } from '@/lib/commercial/deliveries'
import { vUuid, ValidationError } from '@/lib/commercial/validation'

// POST /api/admin/deliveries/:id/dispatch — atomic: issues the
// immutable no-price delivery-note snapshot and advances the
// delivery to 'dispatched' in one SQL transaction.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_dispatch')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')
    const result = await dispatchDelivery({ deliveryId: params.id, actor: cs.user })
    if (isErr(result)) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, data: result.data })
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Dispatch failed.' }, { status: 500 })
  }
}
