import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { hashToken } from '@/lib/commercial/acceptance'
import { recordPod, uploadPodImage, isErr, type PodExceptionInput } from '@/lib/commercial/deliveries'
import { DELIVERY_EXCEPTION_TYPES } from '@/lib/commercial/deliveryLogic'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { UUID_RE } from '@/lib/commercial/validation'

// POST /api/delivery/confirm/:token — public proof of delivery via the
// secure link (site contact OR client, spec §9.5). Multipart form:
// name, conditionNotes, exceptions (JSON), signature (file), photos[].
// Rate-limited; single-use enforced atomically by record_delivery_pod;
// IP hashed, never stored raw. Uploads land in the PRIVATE bucket.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const params = await ctx.params
  const ip = getClientIp(req)
  const rl = checkRateLimit(`delivery-confirm-submit:${ip}`, 10, 10 * 60 * 1000)
  if (!rl.allowed) return respond(false, 'Too many attempts. Please try again shortly.', 429)

  const raw = params.token
  if (!raw || raw.length < 20 || raw.length > 100 || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    return respond(false, 'Invalid link.', 400)
  }

  // Pre-validate the token (cheap read) so uploads only happen for live
  // links; the atomic function re-validates and consumes it afterwards.
  const { data: tok } = await supabaseAdmin
    .from('delivery_confirmation_tokens')
    .select('id, delivery_id, revoked_at, used_at, expires_at')
    .eq('token_hash', hashToken(raw)).single()
  if (!tok) return respond(false, 'This link is not valid.', 404)
  if (tok.revoked_at) return respond(false, 'This link has been superseded.', 410)
  if (tok.used_at) return respond(false, 'This delivery has already been confirmed.', 409)
  if (new Date(tok.expires_at) < new Date()) return respond(false, 'This link has expired.', 410)

  let name = ''
  let conditionNotes: string | null = null
  let exceptionsRaw: unknown = []
  let signatureFile: File | null = null
  let photoFiles: File[] = []

  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    if (!form) return respond(false, 'Invalid submission.', 400)
    name = String(form.get('name') ?? '').trim()
    conditionNotes = form.get('conditionNotes') ? String(form.get('conditionNotes')).slice(0, 4000) : null
    try { exceptionsRaw = JSON.parse(String(form.get('exceptions') ?? '[]')) } catch { exceptionsRaw = [] }
    const sig = form.get('signature')
    if (sig instanceof File && sig.size > 0) signatureFile = sig
    photoFiles = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0).slice(0, 4)
  } else {
    const body = await req.json().catch(() => ({}) as Record<string, unknown>)
    name = String(body.name ?? '').trim()
    conditionNotes = body.conditionNotes ? String(body.conditionNotes).slice(0, 4000) : null
    exceptionsRaw = Array.isArray(body.exceptions) ? body.exceptions : []
  }

  if (!name || name.length > 200) return respond(false, 'Please enter your name.', 400)

  const exceptions = parseExceptions(exceptionsRaw)
  if (typeof exceptions === 'string') return respond(false, exceptions, 400)

  // Upload signature + photos to the private bucket first.
  let signatureUrl: string | null = null
  if (signatureFile) {
    if (signatureFile.size > 5 * 1024 * 1024) return respond(false, 'The signature image is too large.', 400)
    const up = await uploadPodImage({
      deliveryId: tok.delivery_id, kind: 'signature',
      data: Buffer.from(await signatureFile.arrayBuffer()),
      contentType: signatureFile.type || 'image/png',
    })
    if (isErr(up)) return respond(false, up.error, up.status)
    signatureUrl = up.data.path
  }
  const photoUrls: Array<{ url: string; caption?: string | null }> = []
  for (const f of photoFiles) {
    const up = await uploadPodImage({
      deliveryId: tok.delivery_id, kind: 'photo',
      data: Buffer.from(await f.arrayBuffer()),
      contentType: f.type || 'image/jpeg',
    })
    if (isErr(up)) return respond(false, up.error, up.status)
    photoUrls.push({ url: up.data.path, caption: f.name?.slice(0, 200) ?? null })
  }

  const ipHash = createHash('sha256').update(ip + '|fba-delivery-confirm').digest('hex').slice(0, 32)
  const result = await recordPod({
    channel: { kind: 'site_link', raw },
    receivedByName: name,
    conditionNotes,
    signatureUrl,
    photoUrls,
    exceptions,
    ipHash,
  })
  if (isErr(result)) return respond(false, result.error, result.status)

  const withExceptions = exceptions.length > 0
  return respond(true, withExceptions
    ? 'Thank you — this delivery has been confirmed and the noted shortages/damages have been logged. Full Bloom Artelier will follow up.'
    : 'Thank you — this delivery has been confirmed.', 200)
}

function parseExceptions(rawList: unknown): PodExceptionInput[] | string {
  if (!Array.isArray(rawList)) return []
  if (rawList.length > 100) return 'Too many exception rows.'
  const out: PodExceptionInput[] = []
  for (const e of rawList) {
    const rec = (e ?? {}) as Record<string, unknown>
    const id = String(rec.deliveryLineId ?? '')
    if (!UUID_RE.test(id)) return 'Each exception needs a valid item.'
    const type = String(rec.type ?? '')
    if (!(DELIVERY_EXCEPTION_TYPES as string[]).includes(type)) return 'Invalid exception type.'
    const qty = Number(rec.quantityAffected ?? 1)
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1000000) return 'Invalid exception quantity.'
    out.push({
      deliveryLineId: id,
      type: type as PodExceptionInput['type'],
      quantityAffected: qty,
      notes: rec.notes ? String(rec.notes).slice(0, 500) : null,
    })
  }
  return out
}

function respond(ok: boolean, message: string, status: number) {
  return NextResponse.json(
    { success: ok, ...(ok ? { message } : { error: message }) },
    {
      status,
      headers: {
        'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  )
}
