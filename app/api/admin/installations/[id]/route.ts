import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { transitionInstallation, isErr } from '@/lib/commercial/deliveries'
import { INSTALLATION_STATUSES, type InstallationStatus } from '@/lib/commercial/deliveryLogic'
import { ValidationError, vUuid, vUuidOrNull, vString, vDate, vEnum } from '@/lib/commercial/validation'

// PATCH /api/admin/installations/:id — field edits and validated
// status transitions (completion requires a sign-off name).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('installation_manage')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')
    const body = await req.json()

    if (body.status !== undefined) {
      const to = vEnum(body.status, 'status', INSTALLATION_STATUSES, { required: true }) as InstallationStatus
      const result = await transitionInstallation({
        installationId: params.id, to,
        signedOffBy: vString(body.signedOffBy, 'signedOffBy', { max: 200 }),
        completionNotes: vString(body.completionNotes, 'completionNotes', { max: 4000 }),
        actor: cs.user,
      })
      if (isErr(result)) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
      return NextResponse.json({ success: true, data: result.data })
    }

    const { data: inst } = await supabaseAdmin.from('installations')
      .select('id, status, commercial_order_id').eq('id', params.id).single()
    if (!inst) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    if (inst.status === 'completed') {
      return NextResponse.json({ success: false, error: 'A completed installation is signed off; reopen via snagging instead.' }, { status: 409 })
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.scheduledDate !== undefined) updates.scheduled_date = vDate(body.scheduledDate, 'scheduledDate')
    if (body.installerName !== undefined) updates.installer_name = vString(body.installerName, 'installerName', { max: 200 })
    if (body.installerContact !== undefined) updates.installer_contact = vString(body.installerContact, 'installerContact', { max: 300 })
    if (body.accessNotes !== undefined) updates.access_notes = vString(body.accessNotes, 'accessNotes', { max: 4000 })
    if (body.completionNotes !== undefined) updates.completion_notes = vString(body.completionNotes, 'completionNotes', { max: 4000 })
    if (body.linkedDeliveryId !== undefined) {
      const delId = vUuidOrNull(body.linkedDeliveryId, 'linkedDeliveryId')
      if (delId) {
        const { data: del } = await supabaseAdmin.from('deliveries')
          .select('id, commercial_order_id').eq('id', delId).single()
        if (!del || del.commercial_order_id !== inst.commercial_order_id) {
          return NextResponse.json({ success: false, error: 'That delivery does not belong to this order.' }, { status: 400 })
        }
      }
      updates.linked_delivery_id = delId
    }

    const { error } = await supabaseAdmin.from('installations').update(updates).eq('id', params.id)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })
  }
}
