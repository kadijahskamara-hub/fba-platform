import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { buildDeliveryNoteSnapshot, isErr } from '@/lib/commercial/deliveries'
import { hashToken } from '@/lib/commercial/acceptance'
import { renderDeliveryNote } from '@/lib/commercial/deliveryDocuments'
import { DELIVERY_NOTE_AUDIENCES, type DeliveryNoteAudience, type DeliveryNoteSnapshot } from '@/lib/commercial/deliveryLogic'
import { embedLineImages } from '@/lib/commercial/embedImages'
import { UUID_RE } from '@/lib/commercial/validation'

// GET /api/admin/deliveries/:id/document
//   ?audience=client|site|manufacturer   (required)
//   &manufacturerId=<uuid>               (manufacturer copy on consolidated shipments)
//   &t=<raw confirmation token>          (site copy: embeds QR + URL; the raw
//                                         token comes from POST …/confirmation-link
//                                         and is verified by hash before use)
//
// Issued deliveries always render from the immutable snapshot; unissued
// ones render a watermarked draft preview (nothing persisted).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_view')
  if (!cs) return new NextResponse('Forbidden', { status: 403 })
  if (!UUID_RE.test(params.id)) return new NextResponse('Invalid id', { status: 400 })

  const audienceParam = req.nextUrl.searchParams.get('audience') ?? 'client'
  if (!(DELIVERY_NOTE_AUDIENCES as string[]).includes(audienceParam)) {
    return new NextResponse('Invalid audience', { status: 400 })
  }
  const audience = audienceParam as DeliveryNoteAudience

  const manufacturerIdParam = req.nextUrl.searchParams.get('manufacturerId')
  if (manufacturerIdParam && !UUID_RE.test(manufacturerIdParam)) {
    return new NextResponse('Invalid manufacturerId', { status: 400 })
  }

  const { data: del } = await supabaseAdmin.from('deliveries')
    .select('id, locked_at, origin_manufacturer_id').eq('id', params.id).single()
  if (!del) return new NextResponse('Not found', { status: 404 })

  // Snapshot (issued) or watermarked draft preview.
  let snapshot: DeliveryNoteSnapshot | null = null
  let draft = false
  if (del.locked_at) {
    const { data: snapRow } = await supabaseAdmin
      .from('delivery_note_snapshots').select('snapshot').eq('delivery_id', params.id).single()
    if (!snapRow) return new NextResponse('Issued snapshot not found', { status: 404 })
    snapshot = snapRow.snapshot as unknown as DeliveryNoteSnapshot
  } else {
    const built = await buildDeliveryNoteSnapshot(params.id, cs.user.email)
    if (isErr(built)) return new NextResponse(built.error, { status: built.status })
    snapshot = built.data
    draft = true
  }

  // Site copy: verify the supplied raw token belongs to this delivery
  // and is active, then embed BOTH the QR code and the URL text.
  let confirmation: { qrDataUri: string | null; url: string } | null = null
  if (audience === 'site') {
    const raw = req.nextUrl.searchParams.get('t')
    if (raw && /^[A-Za-z0-9_-]{20,100}$/.test(raw)) {
      const { data: tok } = await supabaseAdmin
        .from('delivery_confirmation_tokens')
        .select('id, delivery_id, revoked_at, used_at, expires_at')
        .eq('token_hash', hashToken(raw)).single()
      const valid = tok && tok.delivery_id === params.id && !tok.revoked_at && !tok.used_at
        && new Date(tok.expires_at) > new Date()
      if (valid) {
        const url = `${req.nextUrl.origin}/delivery/confirm/${raw}`
        let qrDataUri: string | null = null
        try {
          qrDataUri = await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#1B4332', light: '#FFFFFF' } })
        } catch { qrDataUri = null }
        confirmation = { qrDataUri, url }
      }
    }
  }

  // Inline product thumbnails so browser print-to-PDF always renders them.
  const renderCopy: DeliveryNoteSnapshot = JSON.parse(JSON.stringify(snapshot))
  await embedLineImages(renderCopy.lines)

  const html = renderDeliveryNote(renderCopy, {
    audience,
    draft,
    manufacturerId: manufacturerIdParam ?? del.origin_manufacturer_id ?? null,
    confirmation,
    logEndpoint: `/api/admin/deliveries/${params.id}/downloaded`,
  })

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Frame-Options': 'DENY',
    },
  })
}
