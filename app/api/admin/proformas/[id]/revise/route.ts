import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { recalculateAndPersist } from '@/lib/commercial/recalc'
import { logAudit } from '@/lib/audit'
import { vUuid, ValidationError } from '@/lib/commercial/validation'

// POST /api/admin/proformas/:id/revise
//
// Amending an issued document: the frozen snapshots in
// issued_documents are permanent (DB triggers block mutation), and
// the working record re-opens as the NEXT revision. Originals are
// preserved verbatim; the old revision number is recorded as
// superseded on the working record.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('quote_edit')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try { vUuid(params.id, 'id') } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof ValidationError ? e.message : 'Invalid id' }, { status: 400 })
  }

  const { data: pf } = await supabaseAdmin
    .from('proformas')
    .select('id, quote_number, proforma_number, revision_number, locked_at, document_status')
    .eq('id', params.id).single()
  if (!pf) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  if (!pf.locked_at) {
    return NextResponse.json({ success: false, error: 'This document is not issued — it can be edited directly.' }, { status: 400 })
  }

  const newRevision = Number(pf.revision_number ?? 1) + 1
  const { error } = await supabaseAdmin.from('proformas').update({
    revision_number: newRevision,
    superseded_by_revision: newRevision,
    document_status: 'draft',
    approval_status: 'none',
    approved_by: null,
    approved_at: null,
    issued_by: null,
    issued_at: null,
    locked_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)
  if (error) return NextResponse.json({ success: false, error: 'Revision failed.' }, { status: 500 })

  await recalculateAndPersist(params.id, { resetApproval: true })

  await logAudit({
    actor: cs.user, action: 'commercial.quote_revised', entityType: 'proforma', entityId: params.id,
    before: { revision: pf.revision_number }, after: { revision: newRevision },
  })

  const { data } = await supabaseAdmin.from('proformas').select('*').eq('id', params.id).single()
  return NextResponse.json({ success: true, data })
}
