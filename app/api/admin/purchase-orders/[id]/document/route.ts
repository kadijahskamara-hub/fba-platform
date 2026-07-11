import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { getCommercialSettings } from '@/lib/commercial/settings'
import { buildPoSnapshotPayload, recalcAndPersistPo } from '@/lib/commercial/purchaseOrders'
import { renderPurchaseOrderDocument, PoSnapshot } from '@/lib/commercial/poDocuments'
import { logAudit } from '@/lib/audit'
import { UUID_RE } from '@/lib/commercial/validation'

// GET /api/admin/purchase-orders/:id/document
//   ?revision=<n>   render a specific issued revision snapshot
//
// Issued POs always render from their immutable snapshot; drafts render
// a watermarked preview built from live data (nothing persisted).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return new NextResponse('Forbidden', { status: 403 })
  if (!UUID_RE.test(params.id)) return new NextResponse('Invalid id', { status: 400 })

  const revisionParam = req.nextUrl.searchParams.get('revision')

  const { data: po } = await supabaseAdmin
    .from('purchase_orders').select('*').eq('id', params.id).single()
  if (!po) return new NextResponse('Not found', { status: 404 })

  let snapshot: PoSnapshot | null = null
  let draft = false

  const wantedRevision = revisionParam ? Number(revisionParam) : (po.locked_at ? Number(po.revision_number) : null)
  if (wantedRevision != null && Number.isFinite(wantedRevision)) {
    const { data: snap } = await supabaseAdmin
      .from('purchase_order_snapshots').select('snapshot')
      .eq('purchase_order_id', params.id).eq('revision', wantedRevision).single()
    if (snap) snapshot = snap.snapshot as unknown as PoSnapshot
  }

  if (!snapshot) {
    if (po.locked_at) return new NextResponse('Issued snapshot not found', { status: 404 })
    const recalc = await recalcAndPersistPo(params.id)
    if ('error' in recalc) return new NextResponse(recalc.error, { status: recalc.status })
    const { data: fresh } = await supabaseAdmin.from('purchase_orders').select('*').eq('id', params.id).single()
    snapshot = await buildPoSnapshotPayload(fresh ?? po, cs.user.email) as unknown as PoSnapshot
    draft = true
  }

  const settings = await getCommercialSettings()
  const html = renderPurchaseOrderDocument(snapshot, {
    draft,
    companyIdentity: {
      legalName: settings.company_legal_name,
      regNumber: settings.company_registration_number,
      vatNumber: settings.vat_number,
      address: settings.registered_address,
      email: settings.invoice_email,
    },
    logEndpoint: `/api/admin/purchase-orders/${params.id}/downloaded`,
  })

  if (!draft) {
    await logAudit({
      actor: cs.user, action: 'commercial.po_downloaded', entityType: 'purchase_order', entityId: params.id,
      after: { revision: snapshot.revision, documentNumber: snapshot.documentNumber },
    })
  }

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
