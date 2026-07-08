import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPipelineSession } from '@/lib/pipelineAuth'
import { logAudit } from '@/lib/audit'
import { PROFORMA_STAGE_KEYS } from '@/lib/pipeline'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/admin/proformas/:id — full proforma with items + sends + contact
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getPipelineSession()
  if (!session) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('proformas')
    .select(`
      *,
      items:proforma_line_items(*, manufacturer:artisans(id, name)),
      sends:proforma_sends(*, manufacturer:artisans(id, name)),
      contact:users!proformas_contact_user_id_fkey(id, first_name, last_name, email, role)
    `)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 404 })

  // Sort items by sort_order for a stable proforma layout.
  if (Array.isArray(data.items)) {
    data.items.sort((a: { sort_order?: number }, b: { sort_order?: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }
  return NextResponse.json({ success: true, data })
}

// PATCH /api/admin/proformas/:id — update header / stage
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getPipelineSession()
  if (!session) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })

  const body = await req.json()

  const { data: before, error: fErr } = await supabaseAdmin
    .from('proformas').select('id, stage, proforma_number').eq('id', params.id).single()
  if (fErr || !before) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.stage !== undefined) {
    if (!PROFORMA_STAGE_KEYS.includes(body.stage)) {
      return NextResponse.json({ success: false, error: 'Invalid stage' }, { status: 400 })
    }
    if (body.stage === 'lost' && !body.lostReason && !body.lost_reason) {
      return NextResponse.json({ success: false, error: 'A reason is required to mark a proforma Lost.' }, { status: 400 })
    }
    updates.stage = body.stage
    // Clear the lost reason when moving out of Lost.
    if (body.stage !== 'lost') updates.lost_reason = null
  }
  if (body.lostReason !== undefined) updates.lost_reason = body.lostReason || null
  if (body.lost_reason !== undefined) updates.lost_reason = body.lost_reason || null

  const map: Record<string, string> = {
    clientName: 'client_name', clientEmail: 'client_email', clientCompany: 'client_company',
    projectName: 'project_name', projectLocation: 'project_location', currency: 'currency',
    notes: 'notes', adminNotes: 'admin_notes', contactUserId: 'contact_user_id', validUntil: 'valid_until',
  }
  for (const [camel, snake] of Object.entries(map)) {
    if (body[camel] !== undefined) updates[snake] = body[camel] || null
  }

  const { data, error } = await supabaseAdmin
    .from('proformas').update(updates).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  if (updates.stage && updates.stage !== before.stage) {
    await logAudit({ actor: session, action: 'proforma.stage_changed', entityType: 'proforma', entityId: params.id,
      before: { stage: before.stage }, after: { stage: updates.stage, lostReason: updates.lost_reason ?? null } })
  }

  return NextResponse.json({ success: true, data })
}

// DELETE /api/admin/proformas/:id
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getPipelineSession()
  if (!session) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const { error } = await supabaseAdmin.from('proformas').delete().eq('id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  await logAudit({ actor: session, action: 'proforma.deleted', entityType: 'proforma', entityId: params.id })
  return NextResponse.json({ success: true })
}
