import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { EXCEPTION_RESOLUTION_STATUSES } from '@/lib/commercial/deliveryLogic'
import { logAudit } from '@/lib/audit'
import { ValidationError, vUuid, vString, vEnum } from '@/lib/commercial/validation'

// PATCH /api/admin/delivery-exceptions/:id — progress a shortage /
// damage / wrong-item exception (open → reordering / credited /
// resolved). Feeds the re-order or Sprint-3 credit-note follow-up.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_confirm')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')
    const body = await req.json()
    const { data: exc } = await supabaseAdmin.from('delivery_line_exceptions')
      .select('id, resolution_status, type').eq('id', params.id).single()
    if (!exc) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.resolutionStatus !== undefined) {
      updates.resolution_status = vEnum(body.resolutionStatus, 'resolutionStatus', EXCEPTION_RESOLUTION_STATUSES, { required: true })
    }
    if (body.resolutionNotes !== undefined) {
      updates.resolution_notes = vString(body.resolutionNotes, 'resolutionNotes', { max: 2000 })
    }
    const { error } = await supabaseAdmin.from('delivery_line_exceptions')
      .update(updates).eq('id', params.id)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    await logAudit({
      actor: cs.user, action: 'commercial.delivery_exception_updated', entityType: 'delivery_exception',
      entityId: params.id, before: { status: exc.resolution_status },
      after: { status: body.resolutionStatus ?? exc.resolution_status, type: exc.type },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })
  }
}
