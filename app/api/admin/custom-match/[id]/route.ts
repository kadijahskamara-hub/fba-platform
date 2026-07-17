import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { ValidationError, vUuid, vUuidOrNull, vString, vNumber, vEnum } from '@/lib/commercial/validation'
import { canTransition, nextStatuses, CUSTOM_MATCH_STATUSES, type CustomMatchStatus } from '@/lib/customMatch/logic'

const FEASIBILITY = ['pending', 'feasible', 'not_feasible', 'feasible_with_conditions'] as const
const APPROVAL = ['not_requested', 'requested', 'approved', 'rejected'] as const
const SAMPLE = ['none', 'client_has_sample', 'sample_requested', 'sample_in_transit', 'sample_received', 'sample_sent_to_maker', 'sample_approved', 'sample_rejected'] as const

// GET — full detail incl. attachments with short-lived signed URLs.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }

  const { data, error } = await supabaseAdmin.from('custom_match_requests')
    .select(`*,
      product:products(id, name, sku, slug, images),
      material_type:material_types(id, name, slug),
      assignee:users!custom_match_requests_assigned_to_fkey(id, first_name, last_name, email),
      requester:users!custom_match_requests_requester_user_id_fkey(id, first_name, last_name, email),
      attachments:custom_match_attachments(*)`)
    .eq('id', params.id).single()
  if (error || !data) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  // Signed URLs for the private bucket (1 hour)
  const attachments = [] as Array<Record<string, unknown>>
  for (const a of (data.attachments ?? []) as Array<Record<string, unknown>>) {
    const { data: signed } = await supabaseAdmin.storage
      .from((a.storage_bucket as string) ?? 'custom-match')
      .createSignedUrl(a.storage_path as string, 3600)
    attachments.push({ ...a, signedUrl: signed?.signedUrl ?? null })
  }

  return NextResponse.json({
    success: true,
    data: { ...data, attachments, allowedNextStatuses: nextStatuses(data.status as CustomMatchStatus) },
  })
}

// PATCH — workflow + assessment fields. Status changes must follow the
// transition map in lib/customMatch/logic (server-enforced).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.id, 'id')
    const body = await req.json().catch(() => ({}))

    const { data: existing } = await supabaseAdmin.from('custom_match_requests')
      .select('id, status, reference_number').eq('id', params.id).single()
    if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    let statusChange: { from: string; to: string } | null = null

    if (body.status !== undefined) {
      const to = vEnum(body.status, 'status', CUSTOM_MATCH_STATUSES, { required: true })!
      const from = existing.status as CustomMatchStatus
      if (to !== from) {
        if (!canTransition(from, to)) {
          return NextResponse.json({
            success: false,
            error: `Cannot move from "${from}" to "${to}". Allowed: ${nextStatuses(from).join(', ') || 'none'}.`,
          }, { status: 409 })
        }
        update.status = to
        statusChange = { from, to }
      }
    }
    if (body.assignedTo !== undefined) update.assigned_to = vUuidOrNull(body.assignedTo, 'assignedTo')
    if (body.makerFeasibility !== undefined) update.maker_feasibility = vEnum(body.makerFeasibility, 'makerFeasibility', FEASIBILITY)
    if (body.feasibilityNotes !== undefined) update.feasibility_notes = vString(body.feasibilityNotes, 'feasibilityNotes', { max: 2000 })
    if (body.costAdjustment !== undefined) update.cost_adjustment = vNumber(body.costAdjustment, 'costAdjustment', { min: -1000000, max: 1000000 })
    if (body.leadTimeAdjustmentWeeks !== undefined) update.lead_time_adjustment_weeks = vNumber(body.leadTimeAdjustmentWeeks, 'leadTimeAdjustmentWeeks', { min: -52, max: 104 })
    if (body.clientApprovalStatus !== undefined) update.client_approval_status = vEnum(body.clientApprovalStatus, 'clientApprovalStatus', APPROVAL)
    if (body.makerApprovalStatus !== undefined) update.maker_approval_status = vEnum(body.makerApprovalStatus, 'makerApprovalStatus', APPROVAL)
    if (body.physicalSampleStatus !== undefined) update.physical_sample_status = vEnum(body.physicalSampleStatus, 'physicalSampleStatus', SAMPLE)
    if (body.internalNotes !== undefined) update.internal_notes = vString(body.internalNotes, 'internalNotes', { max: 5000 })

    const { data, error } = await supabaseAdmin.from('custom_match_requests')
      .update(update).eq('id', params.id).select().single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    await logAudit({
      actor: session, action: 'custom_match.updated', entityType: 'custom_match_request', entityId: params.id,
      after: { reference: existing.reference_number, statusChange, fields: Object.keys(update).filter(k => k !== 'updated_at') },
    })
    return NextResponse.json({
      success: true,
      data: { ...data, allowedNextStatuses: nextStatuses(data.status as CustomMatchStatus) },
    })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
