import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { recordPod, uploadPodImage, isErr, type PodExceptionInput } from '@/lib/commercial/deliveries'
import { DELIVERY_EXCEPTION_TYPES } from '@/lib/commercial/deliveryLogic'
import { ValidationError, vUuid, vString, UUID_RE } from '@/lib/commercial/validation'

// POST /api/admin/deliveries/:id/confirm — internal (admin-recorded)
// proof of delivery: received-by, notes, optional signature/photos
// (multipart), and per-line shortage/damage/wrong-item exceptions.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('pod_record')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')

    let name: string | null = null
    let conditionNotes: string | null = null
    let exceptionsRaw: unknown = []
    let signatureFile: File | null = null
    let photoFiles: File[] = []

    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      name = vString(form.get('name'), 'name', { max: 200, required: true })
      conditionNotes = vString(form.get('conditionNotes'), 'conditionNotes', { max: 4000 })
      try { exceptionsRaw = JSON.parse(String(form.get('exceptions') ?? '[]')) } catch { exceptionsRaw = [] }
      const sig = form.get('signature')
      if (sig instanceof File && sig.size > 0) signatureFile = sig
      photoFiles = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0).slice(0, 4)
    } else {
      const body = await req.json()
      name = vString(body.name, 'name', { max: 200, required: true })
      conditionNotes = vString(body.conditionNotes, 'conditionNotes', { max: 4000 })
      exceptionsRaw = Array.isArray(body.exceptions) ? body.exceptions : []
    }

    const exceptions = parseExceptions(exceptionsRaw)
    if (typeof exceptions === 'string') {
      return NextResponse.json({ success: false, error: exceptions }, { status: 400 })
    }

    // Uploads first (private bucket); the atomic POD then references them.
    let signatureUrl: string | null = null
    if (signatureFile) {
      const up = await uploadPodImage({
        deliveryId: params.id, kind: 'signature',
        data: Buffer.from(await signatureFile.arrayBuffer()),
        contentType: signatureFile.type || 'image/png',
      })
      if (isErr(up)) return NextResponse.json({ success: false, error: up.error }, { status: up.status })
      signatureUrl = up.data.path
    }
    const photoUrls: Array<{ url: string; caption?: string | null }> = []
    for (const f of photoFiles) {
      const up = await uploadPodImage({
        deliveryId: params.id, kind: 'photo',
        data: Buffer.from(await f.arrayBuffer()),
        contentType: f.type || 'image/jpeg',
      })
      if (isErr(up)) return NextResponse.json({ success: false, error: up.error }, { status: up.status })
      photoUrls.push({ url: up.data.path, caption: f.name?.slice(0, 200) ?? null })
    }

    const result = await recordPod({
      channel: { kind: 'admin', deliveryId: params.id, actor: cs.user },
      receivedByName: name!,
      conditionNotes,
      signatureUrl,
      photoUrls,
      exceptions,
    })
    if (isErr(result)) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, data: result.data })
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Could not record the proof of delivery.' }, { status: 500 })
  }
}

function parseExceptions(raw: unknown): PodExceptionInput[] | string {
  if (!Array.isArray(raw)) return []
  if (raw.length > 100) return 'Too many exceptions.'
  const out: PodExceptionInput[] = []
  for (const e of raw) {
    const rec = (e ?? {}) as Record<string, unknown>
    const id = String(rec.deliveryLineId ?? '')
    if (!UUID_RE.test(id)) return 'Each exception needs a valid line.'
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
