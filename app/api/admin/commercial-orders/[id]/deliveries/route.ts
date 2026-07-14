import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { orderDeliveryState, createDelivery, isErr } from '@/lib/commercial/deliveries'
import { ORIGIN_TYPES, type OriginType } from '@/lib/commercial/deliveryLogic'
import { ValidationError, vUuid, vUuidOrNull, vString, vDate, vEnum } from '@/lib/commercial/validation'

// GET  /api/admin/commercial-orders/:id/deliveries — full delivery state:
//      locations (+contacts), deliveries (+lines/packages/PODs),
//      installations, per-line coverage with auto-flagged backorders.
// POST /api/admin/commercial-orders/:id/deliveries — create a delivery.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
  }

  const state = await orderDeliveryState(params.id)
  if (!state) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  const perms = {
    canCreate: cs.permissions.has('delivery_create'),
    canDispatch: cs.permissions.has('delivery_dispatch'),
    canConfirm: cs.permissions.has('delivery_confirm'),
    canRecordPod: cs.permissions.has('pod_record'),
    canManageInstallation: cs.permissions.has('installation_manage'),
    isUltraAdmin: cs.isUltraAdmin,
  }
  return NextResponse.json({ success: true, data: state, permissions: perms })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')
    const body = await req.json()
    const originType = (vEnum(body.originType, 'originType', ORIGIN_TYPES, { required: true })) as OriginType
    const result = await createDelivery({
      orderId: params.id,
      deliveryLocationId: vUuidOrNull(body.deliveryLocationId, 'deliveryLocationId'),
      originType,
      originManufacturerId: vUuidOrNull(body.originManufacturerId, 'originManufacturerId'),
      carrier: vString(body.carrier, 'carrier', { max: 200 }),
      expectedDate: vDate(body.expectedDate, 'expectedDate'),
      instructions: vString(body.instructions, 'instructions', { max: 4000 }),
      actor: cs.user,
    })
    if (isErr(result)) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, data: result.data })
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Could not create the delivery.' }, { status: 500 })
  }
}
