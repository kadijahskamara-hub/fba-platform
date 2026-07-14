import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { applyPackEdit } from '@/lib/commercial/communicationPacks'
import { UUID_RE, ValidationError } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// GET /api/admin/communications/:id — pack + event trail + attachments.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cs = await requireCommercial('communication_prepare')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const { data: pack } = await supabaseAdmin.from('communication_packs').select('*').eq('id', id).single()
  if (!pack) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: events } = await supabaseAdmin.from('communication_events')
    .select('id, event, detail, actor_id, created_at').eq('pack_id', id).order('created_at', { ascending: true })
  const attIds = (pack.attachment_file_ids ?? []) as string[]
  const { data: attachments } = attIds.length
    ? await supabaseAdmin.from('document_files').select('id, entity_type, document_number, audience, version, byte_size, sha256').in('id', attIds)
    : { data: [] }
  return NextResponse.json({ pack, events: events ?? [], attachments: attachments ?? [] })
}

// PATCH /api/admin/communications/:id — edit subject/body/recipients/
// attachments (pre-download only; allowlisted; logged).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cs = await requireCommercial('communication_prepare')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const body = await req.json().catch(() => ({}))
    const patch: { subject?: string; body?: string; recipients?: unknown; attachment_file_ids?: string[] } = {}
    if (body.subject !== undefined) patch.subject = String(body.subject)
    if (body.body !== undefined) patch.body = String(body.body)
    if (body.recipients !== undefined) patch.recipients = body.recipients
    if (body.attachment_file_ids !== undefined) {
      if (!Array.isArray(body.attachment_file_ids)) throw new ValidationError('attachment_file_ids must be an array')
      const ids = body.attachment_file_ids.map((x: unknown) => String(x))
      if (ids.some((x: string) => !UUID_RE.test(x))) throw new ValidationError('attachment_file_ids must be UUIDs')
      patch.attachment_file_ids = ids
    }
    const res = await applyPackEdit(id, patch, cs.user)
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ pack: res.data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
