import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { assignDeliveryLine, isErr } from '@/lib/commercial/deliveries'
import { ValidationError, vUuid, vString, vNumber } from '@/lib/commercial/validation'

// PATCH  /api/admin/deliveries/:id/lines/:lineId — quantity / notes.
// DELETE /api/admin/deliveries/:id/lines/:lineId — pre-dispatch only.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; lineId: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id'); vUuid(params.lineId, 'lineId')
    const body = await req.json()
    const { data: line } = await supabaseAdmin.from('delivery_lines')
      .select('id, delivery_id, source_line_item_id, quantity').eq('id', params.lineId).single()
    if (!line || line.delivery_id !== params.id) {
      return NextResponse.json({ success: false, error: 'Line not found' }, { status: 404 })
    }
    const result = await assignDeliveryLine({
      deliveryId: params.id,
      sourceLineItemId: line.source_line_item_id,
      quantity: vNumber(body.quantity ?? line.quantity, 'quantity', { min: 0.001, max: 1000000, required: true })!,
      notes: body.notes !== undefined ? vString(body.notes, 'notes', { max: 1000 }) : undefined,
      existingLineId: params.lineId,
      actor: cs.user,
    })
    if (isErr(result)) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, data: result.data })
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; lineId: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id'); vUuid(params.lineId, 'lineId') } catch {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
  }

  const { data: del } = await supabaseAdmin.from('deliveries')
    .select('id, dispatch_status, locked_at').eq('id', params.id).single()
  if (!del) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  if (del.locked_at || !['pending', 'preparing'].includes(del.dispatch_status)) {
    return NextResponse.json({ success: false, error: 'Lines can only be removed before dispatch.' }, { status: 409 })
  }

  const { error } = await supabaseAdmin.from('delivery_lines')
    .delete().eq('id', params.lineId).eq('delivery_id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
