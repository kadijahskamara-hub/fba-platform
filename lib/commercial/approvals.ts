import 'server-only'
import { supabaseAdmin } from '../supabase'
import { logAudit } from '../audit'
import type { CommercialSession } from './permissions'
import type { ApprovalStatus } from './types'

// ============================================================
// Approval workflow.
//
// The calculation engine determines WHAT approval a document
// needs (approval_status on the record); this module enforces
// WHO may grant it:
//   required_commercial → quote_approve permission
//   required_ultra / blocked → Ultra Admin only
// ============================================================

export function canApprove(cs: CommercialSession, status: ApprovalStatus): boolean {
  switch (status) {
    case 'required_commercial':
      return cs.permissions.has('quote_approve') || cs.isUltraAdmin
    case 'required_ultra':
    case 'blocked':
      return cs.isUltraAdmin
    default:
      return false
  }
}

export async function approveDocument(params: {
  proformaId: string
  cs: CommercialSession
  note?: string | null
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { proformaId, cs, note } = params
  const { data: pf } = await supabaseAdmin
    .from('proformas')
    .select('id, approval_status, approval_reason, locked_at, proforma_number, quote_number')
    .eq('id', proformaId).single()
  if (!pf) return { error: 'Document not found', status: 404 }
  if (pf.locked_at) return { error: 'Issued documents cannot be re-approved. Create a new revision.', status: 409 }

  const status = pf.approval_status as ApprovalStatus
  if (status === 'none' || status === 'approved') {
    return { error: 'This document does not require approval.', status: 400 }
  }
  if (!canApprove(cs, status)) {
    const needed = status === 'required_commercial' ? 'Commercial Admin (quote_approve)' : 'Ultra Admin'
    return { error: `${needed} approval is required for this document.`, status: 403 }
  }

  await supabaseAdmin.from('proformas').update({
    approval_status: 'approved',
    approved_by: cs.user.id,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', proformaId)

  await logAudit({
    actor: cs.user,
    action: 'commercial.approved',
    entityType: 'proforma',
    entityId: proformaId,
    before: { approval_status: status, reason: pf.approval_reason },
    after: { approval_status: 'approved', note: note ?? null },
  })
  return { ok: true }
}

export async function rejectApproval(params: {
  proformaId: string
  cs: CommercialSession
  note?: string | null
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { proformaId, cs, note } = params
  const { data: pf } = await supabaseAdmin
    .from('proformas').select('id, approval_status, locked_at').eq('id', proformaId).single()
  if (!pf) return { error: 'Document not found', status: 404 }
  if (pf.locked_at) return { error: 'Issued documents cannot be modified.', status: 409 }

  const status = pf.approval_status as ApprovalStatus
  if (!canApprove(cs, status === 'approved' ? 'required_commercial' : status)) {
    return { error: 'You are not authorised to action approvals on this document.', status: 403 }
  }

  await supabaseAdmin.from('proformas').update({
    approval_status: status === 'approved' ? 'required_commercial' : status,
    approved_by: null,
    approved_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', proformaId)

  await logAudit({
    actor: cs.user,
    action: 'commercial.approval_rejected',
    entityType: 'proforma',
    entityId: proformaId,
    after: { note: note ?? null },
  })
  return { ok: true }
}
