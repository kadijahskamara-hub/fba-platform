import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPipelineSession } from '@/lib/pipelineAuth'
import { logAudit } from '@/lib/audit'
import { UUID_RE } from '@/lib/commercial/validation'

const DOC_TYPES = ['quote', 'proforma', 'invoice', 'service_invoice']

// POST /api/admin/proformas/:id/download — log a document download.
// Documents are downloaded as PDFs and attached to emails manually;
// this log replaces the old auto-email send log.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getPipelineSession()
  if (!session) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })

  const body = await req.json().catch(() => ({}))

  const docType = DOC_TYPES.includes(String(body.docType)) ? String(body.docType) : 'proforma'
  const audience = body.audience === 'manufacturer' ? 'manufacturer' : 'client'
  if (audience === 'manufacturer' && !body.manufacturerId && !body.manufacturerName) {
    return NextResponse.json({ success: false, error: 'Manufacturer is required for a manufacturer copy.' }, { status: 400 })
  }
  if (body.manufacturerId && !UUID_RE.test(String(body.manufacturerId))) {
    return NextResponse.json({ success: false, error: 'Invalid manufacturer id' }, { status: 400 })
  }
  if (body.issuedDocumentId && !UUID_RE.test(String(body.issuedDocumentId))) {
    return NextResponse.json({ success: false, error: 'Invalid issued document id' }, { status: 400 })
  }

  const { data: proforma, error: pErr } = await supabaseAdmin
    .from('proformas').select('id, proforma_number').eq('id', params.id).single()
  if (pErr || !proforma) return NextResponse.json({ success: false, error: 'Proforma not found' }, { status: 404 })

  const { data, error } = await supabaseAdmin
    .from('proforma_downloads')
    .insert({
      proforma_id:        params.id,
      doc_type:           docType,
      audience,
      issued_document_id: body.issuedDocumentId || null,
      manufacturer_id:    body.manufacturerId || null,
      manufacturer_name:  body.manufacturerName ? String(body.manufacturerName).slice(0, 200) : null,
      note:               body.note ? String(body.note).slice(0, 1000) : null,
      downloaded_by:      session.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ success: false, error: 'Log failed.' }, { status: 500 })

  await logAudit({
    actor: session, action: 'commercial.document_downloaded', entityType: 'proforma', entityId: params.id,
    after: { docType, audience, manufacturerId: body.manufacturerId ?? null, draft: Boolean(body.draft) },
  })

  return NextResponse.json({ success: true, data })
}
