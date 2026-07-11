import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { recalculateAndPersist } from '@/lib/commercial/recalc'
import { buildSnapshotPayload, latestIssuedDocument } from '@/lib/commercial/snapshots'
import { renderCommercialDocument, DocumentSnapshot } from '@/lib/commercial/documents'
import { withRevision } from '@/lib/commercial/numbering'
import {
  renderDocumentHtml, DEFAULT_DOC_SETTINGS, DocProforma, DocLineItem, DocSettings,
} from '@/lib/proformaDocument'
import { UUID_RE } from '@/lib/commercial/validation'
import type { IssuedDocType } from '@/lib/commercial/types'

// GET /api/admin/proformas/:id/document
//   ?type=quote|proforma|invoice|service_invoice
//   &issuedId=<uuid>          render a specific frozen snapshot
//   &audience=manufacturer    LEGACY maker copy (transitional; see below)
//
// Issued documents are ALWAYS rendered from their immutable snapshot in
// issued_documents — never from live data. When no snapshot exists the
// route renders a watermarked DRAFT preview from a freshly recalculated
// snapshot-shaped payload (nothing is persisted or numbered).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('quote_pipeline_view')
  if (!cs) return new NextResponse('Forbidden', { status: 403 })
  if (!UUID_RE.test(params.id)) return new NextResponse('Invalid id', { status: 400 })

  const sp = req.nextUrl.searchParams
  const docType = (sp.get('type') ?? 'proforma') as IssuedDocType
  if (!['quote', 'proforma', 'invoice', 'service_invoice'].includes(docType)) {
    return new NextResponse('Invalid document type', { status: 400 })
  }

  // ── RETIRED: manufacturer maker copies (Sprint 2) ──
  // Manufacturer instructions are now proper purchase orders with
  // supplier costs. New filtered client pro formas are no longer
  // generated for suppliers; historic download records remain
  // auditable in the downloads log. Historic re-renders stay possible
  // ONLY via the explicit legacy flag so past documents can be audited.
  if (sp.get('audience') === 'manufacturer') {
    if (sp.get('legacy') === '1') {
      return legacyManufacturerCopy(req, params.id)
    }
    return new NextResponse(
      'Maker copies have been replaced by purchase orders. Create the order under Commercial Orders → Procurement and issue a PO instead. (Historic maker copies remain available for audit via the download history.)',
      { status: 410 },
    )
  }

  const issuedId = sp.get('issuedId')
  if (issuedId && !UUID_RE.test(issuedId)) return new NextResponse('Invalid issuedId', { status: 400 })

  let snapshot: DocumentSnapshot | null = null
  let draft = false

  if (issuedId) {
    const { data } = await supabaseAdmin
      .from('issued_documents').select('*').eq('id', issuedId).eq('proforma_id', params.id).single()
    if (!data) return new NextResponse('Issued document not found', { status: 404 })
    snapshot = data.snapshot as DocumentSnapshot
  } else {
    const latest = await latestIssuedDocument(params.id, docType)
    if (latest) {
      snapshot = latest.snapshot as unknown as DocumentSnapshot
    }
  }

  if (!snapshot) {
    // Draft preview: recalculate, build a snapshot-shaped payload in
    // memory, and watermark it. No numbers are allocated.
    const recalc = await recalculateAndPersist(params.id)
    if ('error' in recalc) {
      // A locked doc without a snapshot of this type falls back to stored values.
      if (recalc.status !== 409) return new NextResponse(recalc.error, { status: recalc.status })
    }
    const { data: pf } = await supabaseAdmin.from('proformas').select('*').eq('id', params.id).single()
    if (!pf) return new NextResponse('Not found', { status: 404 })

    const previewNumber =
      docType === 'quote' ? withRevision((pf.quote_number as string) ?? 'FBA-Q-DRAFT', Number(pf.revision_number ?? 1))
      : docType === 'proforma' ? (pf.proforma_number as string)
      : (pf.invoice_number as string) ?? 'FBA-INV-DRAFT'

    snapshot = await buildSnapshotPayload({
      pf, docType, documentNumber: previewNumber,
      revision: Number(pf.revision_number ?? 1), actorEmail: cs.user.email,
    }) as unknown as DocumentSnapshot
    draft = true
  }

  const html = renderCommercialDocument(snapshot, {
    draft,
    logEndpoint: `/api/admin/proformas/${params.id}/download`,
    logPayload: { docType, audience: 'client', draft },
  })

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  })
}

// ── Legacy manufacturer copy renderer (unchanged behaviour) ──
async function legacyManufacturerCopy(req: NextRequest, id: string) {
  const sp = req.nextUrl.searchParams
  const manufacturerId = sp.get('manufacturerId')
  if (manufacturerId && !UUID_RE.test(manufacturerId)) {
    return new NextResponse('Invalid manufacturer id', { status: 400 })
  }
  const manufacturerNameParam = (sp.get('manufacturerName') ?? '').slice(0, 200) || null

  const { data: pf, error } = await supabaseAdmin
    .from('proformas')
    .select('*, items:proforma_line_items(*, manufacturer:artisans(id, name), product:products(images))')
    .eq('id', id)
    .single()
  if (error || !pf) return new NextResponse('Proforma not found', { status: 404 })

  let manufacturerName: string | null = manufacturerNameParam
  if (manufacturerId) {
    const { data: artisan } = await supabaseAdmin.from('artisans').select('name').eq('id', manufacturerId).single()
    manufacturerName = artisan?.name ?? manufacturerName
  }
  if (!manufacturerName) return new NextResponse('Choose which manufacturer this copy is for.', { status: 400 })

  const { data: settingsRow } = await supabaseAdmin
    .from('site_settings').select('value').eq('key', 'document_settings').single()
  const settings: DocSettings = { ...DEFAULT_DOC_SETTINGS, ...((settingsRow?.value as Partial<DocSettings>) ?? {}) }

  type RawItem = Record<string, unknown> & {
    manufacturer?: { id: string; name: string } | null
    product?: { images?: string[] | null } | null
  }
  const rawItems = ((pf.items ?? []) as RawItem[])
    .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))

  const items: DocLineItem[] = rawItems.map(it => ({
    name: (it.name as string) ?? 'Item',
    description: (it.description as string) ?? null,
    is_bespoke: Boolean(it.is_bespoke),
    quantity: Number(it.quantity) || 0,
    unit_price: it.unit_price == null ? null : Number(it.unit_price),
    selected_finish: (it.selected_finish as string) ?? null,
    selected_fabric: (it.selected_fabric as string) ?? null,
    selected_size: (it.selected_size as string) ?? null,
    spec_details: (it.spec_details as string) ?? null,
    notes: (it.notes as string) ?? null,
    section: (it.section as string) ?? null,
    image_url: (it.image_url as string) ?? it.product?.images?.[0] ?? null,
    manufacturer_id: (it.manufacturer_id as string) ?? null,
    manufacturer_name_resolved: it.manufacturer?.name ?? (it.manufacturer_name as string) ?? null,
  }))

  const doc: DocProforma = {
    proforma_number: pf.proforma_number,
    invoice_number: null,
    invoice_date: null,
    invoice_due_date: null,
    client_name: pf.client_name ?? null,
    client_email: pf.client_email ?? null,
    client_company: pf.client_company ?? null,
    project_name: pf.project_name ?? null,
    project_location: pf.project_location ?? null,
    currency: pf.currency ?? 'GBP',
    notes: pf.notes ?? null,
    valid_until: pf.valid_until ?? null,
    vat_rate: Number(pf.vat_rate ?? 20),
    deposit_percent: Number(pf.deposit_percent ?? 50),
    lead_time: pf.lead_time ?? null,
    delivery_notes: pf.delivery_notes ?? null,
    payment_terms: pf.payment_terms ?? null,
    created_at: pf.created_at,
    items,
  }

  const html = renderDocumentHtml(doc, settings, {
    docType: 'proforma',
    audience: 'manufacturer',
    manufacturerName,
    logEndpoint: `/api/admin/proformas/${id}/download`,
    logPayload: {
      docType: 'proforma',
      audience: 'manufacturer',
      manufacturerId: manufacturerId ?? null,
      manufacturerName,
    },
  })

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  })
}
