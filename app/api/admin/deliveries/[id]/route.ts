import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { transitionDelivery, podSignedUrl, isErr } from '@/lib/commercial/deliveries'
import { DISPATCH_STATUSES, type DispatchStatus } from '@/lib/commercial/deliveryLogic'
import { logAudit } from '@/lib/audit'
import { ValidationError, vUuid, vUuidOrNull, vString, vDate, vEnum } from '@/lib/commercial/validation'

// GET    /api/admin/deliveries/:id — delivery detail (lines, packages,
//        PODs with short-lived signed URLs, exceptions, tokens meta).
// PATCH  /api/admin/deliveries/:id — pre-dispatch field edits and
//        validated manual status transitions.
// DELETE /api/admin/deliveries/:id — pending/preparing, unissued only.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
  }

  const { data: del } = await supabaseAdmin
    .from('deliveries')
    .select('*, location:delivery_locations(*, contacts:site_contacts(*)), manufacturer:artisans(id, name), order:commercial_orders(id, order_number, client_snapshot, project_snapshot), lines:delivery_lines(*, source_line:proforma_line_items(id, name, quantity, unit_of_measure, selected_finish, image_url, manufacturer:artisans(id, name))), packages:delivery_packages(*), pods:proof_of_delivery(*, photos:pod_photos(*))')
    .eq('id', params.id).single()
  if (!del) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  // Exceptions on this delivery's lines.
  const lineIds = ((del.lines ?? []) as Array<Record<string, unknown>>).map(l => l.id as string)
  let exceptions: Array<Record<string, unknown>> = []
  if (lineIds.length > 0) {
    const { data } = await supabaseAdmin.from('delivery_line_exceptions')
      .select('*').in('delivery_line_id', lineIds).order('created_at')
    exceptions = data ?? []
  }

  // Short-lived signed URLs for private POD assets.
  const pods = await Promise.all(((del.pods ?? []) as Array<Record<string, unknown>>).map(async pod => ({
    ...pod,
    signature_signed_url: pod.signature_url ? await podSignedUrl(pod.signature_url as string) : null,
    photos: await Promise.all(((pod.photos ?? []) as Array<Record<string, unknown>>).map(async ph => ({
      ...ph,
      signed_url: await podSignedUrl(ph.url as string),
    }))),
  })))

  // Token metadata only (never hashes).
  const { data: tokens } = await supabaseAdmin
    .from('delivery_confirmation_tokens')
    .select('id, expires_at, revoked_at, first_viewed_at, used_at, created_at')
    .eq('delivery_id', params.id).order('created_at', { ascending: false })

  const perms = {
    canCreate: cs.permissions.has('delivery_create'),
    canDispatch: cs.permissions.has('delivery_dispatch'),
    canConfirm: cs.permissions.has('delivery_confirm'),
    canRecordPod: cs.permissions.has('pod_record'),
    canManageInstallation: cs.permissions.has('installation_manage'),
  }
  return NextResponse.json({
    success: true,
    data: { ...del, pods, exceptions, tokens: tokens ?? [] },
    permissions: perms,
  })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')
    const body = await req.json()

    // Status transitions go through the state machine.
    if (body.status !== undefined) {
      const csTransition = await requireCommercial('delivery_dispatch')
      if (!csTransition) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      const to = vEnum(body.status, 'status', DISPATCH_STATUSES, { required: true }) as DispatchStatus
      const result = await transitionDelivery({ deliveryId: params.id, to, actor: cs.user })
      if (isErr(result)) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
      return NextResponse.json({ success: true, data: result.data })
    }

    const { data: del } = await supabaseAdmin.from('deliveries')
      .select('id, dispatch_status, locked_at, commercial_order_id').eq('id', params.id).single()
    if (!del) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    if (del.locked_at || !['pending', 'preparing'].includes(del.dispatch_status)) {
      return NextResponse.json({ success: false, error: 'Details can only be edited before dispatch.' }, { status: 409 })
    }

    // Allowlisted field updates only.
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.carrier !== undefined) updates.carrier = vString(body.carrier, 'carrier', { max: 200 })
    if (body.expectedDate !== undefined) updates.expected_date = vDate(body.expectedDate, 'expectedDate')
    if (body.instructions !== undefined) updates.instructions = vString(body.instructions, 'instructions', { max: 4000 })
    if (body.deliveryLocationId !== undefined) {
      const locId = vUuidOrNull(body.deliveryLocationId, 'deliveryLocationId')
      if (locId) {
        const { data: loc } = await supabaseAdmin.from('delivery_locations')
          .select('id, commercial_order_id').eq('id', locId).single()
        if (!loc || loc.commercial_order_id !== del.commercial_order_id) {
          return NextResponse.json({ success: false, error: 'That location does not belong to this order.' }, { status: 400 })
        }
      }
      updates.delivery_location_id = locId
    }

    const { error } = await supabaseAdmin.from('deliveries').update(updates).eq('id', params.id)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
  }

  const { data: del } = await supabaseAdmin.from('deliveries')
    .select('id, delivery_number, dispatch_status, locked_at').eq('id', params.id).single()
  if (!del) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  if (del.locked_at || !['pending', 'preparing'].includes(del.dispatch_status)) {
    return NextResponse.json({ success: false, error: 'Only an unissued pending/preparing delivery can be removed.' }, { status: 409 })
  }

  const { error } = await supabaseAdmin.from('deliveries').delete().eq('id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  await logAudit({
    actor: cs.user, action: 'commercial.delivery_deleted', entityType: 'delivery',
    entityId: params.id, before: { deliveryNumber: del.delivery_number },
  })
  return NextResponse.json({ success: true })
}
