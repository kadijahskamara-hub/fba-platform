import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { validateAttachment } from '@/lib/customMatch/logic'

// POST /api/custom-match/[id]/attachments — public upload window for a
// just-submitted request (Sprint 13). Constraints (md doc §17.3): the id
// is an unguessable uuid, uploads are only accepted while the request is
// still in 'submitted' status AND within 1 hour of submission, max 5
// files, 15 MB each, strict MIME/extension allowlist, random storage key
// in the PRIVATE custom-match bucket. Access afterwards is signed-URL
// only via the staff admin.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FILES = 5

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const rl = checkRateLimit(`custom-match-upload:${getClientIp(req)}`, 12, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'Too many uploads. Please slow down.' }, { status: 429 })
  }
  if (!UUID_RE.test(params.id)) return NextResponse.json({ success: false, error: 'Invalid request.' }, { status: 400 })

  const { data: request } = await supabaseAdmin
    .from('custom_match_requests')
    .select('id, status, submitted_at')
    .eq('id', params.id).single()
  if (!request) return NextResponse.json({ success: false, error: 'Request not found.' }, { status: 404 })

  const submittedAt = request.submitted_at ? new Date(request.submitted_at as string).getTime() : 0
  const windowOpen = request.status === 'submitted' && Date.now() - submittedAt < 60 * 60 * 1000
  if (!windowOpen) {
    return NextResponse.json({ success: false, error: 'The upload window for this request has closed. Please reply to our team instead.' }, { status: 403 })
  }

  const { count } = await supabaseAdmin
    .from('custom_match_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('custom_match_request_id', params.id)
  if ((count ?? 0) >= MAX_FILES) {
    return NextResponse.json({ success: false, error: `A maximum of ${MAX_FILES} files can be attached.` }, { status: 400 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 })

  const check = validateAttachment({ filename: file.name, mimeType: file.type, size: file.size })
  if (!check.ok) return NextResponse.json({ success: false, error: check.error }, { status: 400 })

  const ext = file.name.toLowerCase().split('.').pop()
  const path = `requests/${params.id}/${randomBytes(10).toString('hex')}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await supabaseAdmin.storage.from('custom-match')
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ success: false, error: 'Upload failed. Please try again.' }, { status: 500 })

  const { data, error } = await supabaseAdmin.from('custom_match_attachments').insert({
    custom_match_request_id: params.id,
    storage_path: path,
    original_filename: file.name.slice(0, 300),
    mime_type: file.type,
    file_size: file.size,
    visibility: 'internal',
  }).select('id, original_filename').single()
  if (error) return NextResponse.json({ success: false, error: 'Could not record the attachment.' }, { status: 500 })

  return NextResponse.json({ success: true, data })
}
