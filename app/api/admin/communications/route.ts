import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { preparePack, type AttachmentSpec, type PackEntities } from '@/lib/commercial/communicationPacks'
import { vUuidOrNull, vEnum, vString, UUID_RE, ValidationError } from '@/lib/commercial/validation'
import { DOCUMENT_FILE_ENTITY_TYPES, DOCUMENT_AUDIENCES, COMMUNICATION_PACK_STATUSES, type DocumentFileEntityType, type DocumentAudience } from '@/lib/commercial/types'

export const runtime = 'nodejs'

const KEY_RE = /^[a-z0-9_]{2,64}$/

// GET /api/admin/communications?status=&outstanding=1
export async function GET(req: NextRequest) {
  const cs = await requireCommercial('communication_prepare')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  let q = supabaseAdmin.from('communication_packs')
    .select('id, pack_number, pack_type, template_key, subject, status, attention_note, version, superseded_by_id, commercial_order_id, proforma_id, sales_invoice_id, purchase_order_id, delivery_id, marked_sent_at, created_at')
    .order('created_at', { ascending: false }).limit(200)

  const status = sp.get('status')
  if (status && (COMMUNICATION_PACK_STATUSES as string[]).includes(status)) q = q.eq('status', status)
  if (sp.get('outstanding') === '1') q = q.in('status', ['prepared', 'downloaded', 'needs_attention'])

  const { data } = await q
  return NextResponse.json({ packs: data ?? [] })
}

// POST /api/admin/communications — prepare a pack from a template + entity.
// body: { templateKey, entities{}, attachments[], varsExtra?, confirmationUrl? }
export async function POST(req: NextRequest) {
  const cs = await requireCommercial('communication_prepare')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body.templateKey !== 'string' || !KEY_RE.test(body.templateKey)) {
      throw new ValidationError('templateKey is required')
    }
    const e = (body.entities ?? {}) as Record<string, unknown>
    const entities: PackEntities = {
      commercial_order_id: vUuidOrNull(e.commercial_order_id, 'commercial_order_id'),
      proforma_id: vUuidOrNull(e.proforma_id, 'proforma_id'),
      sales_invoice_id: vUuidOrNull(e.sales_invoice_id, 'sales_invoice_id'),
      purchase_order_id: vUuidOrNull(e.purchase_order_id, 'purchase_order_id'),
      delivery_id: vUuidOrNull(e.delivery_id, 'delivery_id'),
    }
    const rawAtt = Array.isArray(body.attachments) ? body.attachments : []
    const attachments: AttachmentSpec[] = rawAtt.slice(0, 12).map((a: Record<string, unknown>) => ({
      entityType: vEnum(a.entityType, 'attachment.entityType', DOCUMENT_FILE_ENTITY_TYPES, { required: true }) as DocumentFileEntityType,
      entityId: (() => { if (typeof a.entityId !== 'string' || !UUID_RE.test(a.entityId)) throw new ValidationError('attachment.entityId must be a UUID'); return a.entityId })(),
      audience: a.audience ? (vEnum(a.audience, 'attachment.audience', DOCUMENT_AUDIENCES) as DocumentAudience) : null,
    }))

    const varsExtra: Record<string, string> = {}
    if (body.varsExtra && typeof body.varsExtra === 'object') {
      for (const [k, v] of Object.entries(body.varsExtra as Record<string, unknown>)) {
        if (/^[a-z0-9_]{1,40}$/.test(k)) varsExtra[k] = String(v).slice(0, 500)
      }
    }
    const confirmationUrl = vString(body.confirmationUrl, 'confirmationUrl', { max: 500 })
    const confirmation = confirmationUrl ? { url: confirmationUrl } : null

    const res = await preparePack({ templateKey: body.templateKey, entities, attachments, actor: cs.user, varsExtra, confirmation })
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ pack: res.data }, { status: 201 })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
