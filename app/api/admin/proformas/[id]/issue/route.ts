import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { issueDocument } from '@/lib/commercial/snapshots'
import { logAudit } from '@/lib/audit'
import { vUuid, vEnum, ValidationError } from '@/lib/commercial/validation'
import type { IssuedDocType } from '@/lib/commercial/types'

// POST /api/admin/proformas/:id/issue  { docType }
//
// Freezes an immutable snapshot in issued_documents and locks the
// working record on first issue. A document needing approval cannot
// be issued (enforced inside issueDocument).
//   quote / proforma        → quote_edit
//   invoice / service_invoice → invoice_issue
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let docType: IssuedDocType
  try {
    vUuid(params.id, 'id')
    const body = await req.json()
    docType = vEnum(body.docType, 'docType', ['quote', 'proforma', 'invoice', 'service_invoice'] as const, { required: true })!
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof ValidationError ? e.message : 'Invalid request' }, { status: 400 })
  }

  const needed = docType === 'invoice' || docType === 'service_invoice' ? 'invoice_issue' : 'quote_edit'
  const cs = await requireCommercial(needed)
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const result = await issueDocument({ proformaId: params.id, docType, actor: cs.user })
  if ('error' in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status })

  const auditAction =
    docType === 'quote' ? 'commercial.quote_issued'
    : docType === 'proforma' ? 'commercial.proforma_issued'
    : 'commercial.invoice_issued'
  await logAudit({
    actor: cs.user, action: auditAction, entityType: 'issued_document', entityId: result.doc.id,
    after: { proformaId: params.id, docType, documentNumber: result.doc.document_number, revision: result.doc.revision },
  })

  return NextResponse.json({ success: true, data: result.doc })
}
