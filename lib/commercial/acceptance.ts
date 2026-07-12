import 'server-only'
import { createHash, randomBytes } from 'crypto'
import { supabaseAdmin } from '../supabase'
import { logAudit } from '../audit'
import { getCommercialSettings } from './settings'
import type { SessionUser } from '../types'

// ============================================================
// Client acceptance (Sprint 3).
//
// Acceptance is explicit and revision-specific. It references an
// issued immutable snapshot (issued_documents), binds to one
// revision, and is recorded atomically (accept_commercial_document).
// 'issued' is never conflated with 'accepted'.
// ============================================================

interface DomainErr { error: string; status: number }
export type DomainResult<T> = { data: T } | DomainErr
export function isErr<T>(r: DomainResult<T>): r is DomainErr { return (r as DomainErr).error !== undefined }

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/** Latest issued snapshot for a proforma (the revision a client would accept). */
async function latestIssuedDocument(proformaId: string) {
  const { data } = await supabaseAdmin
    .from('issued_documents').select('*').eq('proforma_id', proformaId)
    .order('revision', { ascending: false }).order('issued_at', { ascending: false }).limit(1).single()
  return data
}

/** Mint a single-purpose acceptance link; revoke any previous active token. */
export async function createAcceptanceToken(params: {
  proformaId: string; actor: SessionUser
}): Promise<DomainResult<{ token: string; url: string; documentNumber: string; expiresAt: string }>> {
  const { data: pf } = await supabaseAdmin.from('proformas').select('id, acceptance_status').eq('id', params.proformaId).single()
  if (!pf) return { error: 'Commercial record not found', status: 404 }

  const doc = await latestIssuedDocument(params.proformaId)
  if (!doc) return { error: 'This record has not been issued yet. Only an issued document can be sent for acceptance.', status: 409 }

  // Draft/superseded cannot be accepted: we always bind to the latest issued revision.
  await supabaseAdmin.from('commercial_acceptance_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('issued_document_id', doc.id).is('revoked_at', null)
  // Revoke tokens for older revisions of the same proforma too.
  await supabaseAdmin.from('commercial_acceptance_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('proforma_id', params.proformaId).is('revoked_at', null).neq('issued_document_id', doc.id)

  const settings = await getCommercialSettings()
  const expiryDays = Number(settings.default_quote_expiry_days ?? 30)
  const raw = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + expiryDays * 86400000).toISOString()

  const { error } = await supabaseAdmin.from('commercial_acceptance_tokens').insert({
    issued_document_id: doc.id, proforma_id: params.proformaId, revision: doc.revision,
    token_hash: hashToken(raw), expires_at: expiresAt, created_by: params.actor.id,
  })
  if (error) return { error: 'Could not create the acceptance link.', status: 500 }

  await supabaseAdmin.from('proformas').update({ acceptance_status: 'sent' }).eq('id', params.proformaId)
  await logAudit({
    actor: params.actor, action: 'commercial.acceptance_link_created', entityType: 'proforma', entityId: params.proformaId,
    after: { documentNumber: doc.document_number, revision: doc.revision, expiresAt },
  })
  return { data: { token: raw, url: `/accept/${raw}`, documentNumber: doc.document_number, expiresAt } }
}

/** Public token resolution for the client acceptance page. */
export async function resolveAcceptanceToken(raw: string): Promise<
  DomainResult<{ token: Record<string, unknown>; document: Record<string, unknown> }>
> {
  if (!raw || raw.length < 20 || raw.length > 100 || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    return { error: 'Invalid link.', status: 400 }
  }
  const { data: tok } = await supabaseAdmin
    .from('commercial_acceptance_tokens').select('*').eq('token_hash', hashToken(raw)).single()
  if (!tok) return { error: 'This link is not valid.', status: 404 }
  if (tok.revoked_at) return { error: 'This link has been superseded. Please use the most recent link we sent you.', status: 410 }
  if (new Date(tok.expires_at) < new Date()) return { error: 'This link has expired. Please contact Full Bloom Artelier for a new one.', status: 410 }

  const { data: doc } = await supabaseAdmin.from('issued_documents').select('*').eq('id', tok.issued_document_id).single()
  if (!doc) return { error: 'Document unavailable.', status: 404 }

  if (!tok.first_viewed_at) {
    await supabaseAdmin.from('commercial_acceptance_tokens').update({ first_viewed_at: new Date().toISOString() }).eq('id', tok.id)
    await supabaseAdmin.from('proformas').update({ acceptance_status: 'viewed' })
      .eq('id', tok.proforma_id).eq('acceptance_status', 'sent')
    await logAudit({ actor: null, action: 'commercial.document_viewed', entityType: 'proforma', entityId: tok.proforma_id as string, after: { revision: tok.revision } })
  }
  return { data: { token: tok, document: doc } }
}

/** Atomically record client accept/decline via the secure link. */
export async function recordClientAcceptance(params: {
  raw: string; action: 'accept' | 'decline'; name: string; email: string; note?: string | null
  ipHash?: string | null; userAgent?: string | null
}): Promise<DomainResult<{ action: string }>> {
  const { data, error } = await supabaseAdmin.rpc('accept_commercial_document', {
    p_token_hash: hashToken(params.raw), p_action: params.action,
    p_name: params.name, p_email: params.email, p_note: params.note ?? null,
    p_ip_hash: params.ipHash ?? null, p_user_agent: params.userAgent ?? null,
  })
  if (error) return { error: `Submission failed: ${error.message}`, status: 500 }
  const res = data as { ok: boolean; error?: string; action?: string; proforma_id?: string }
  if (!res?.ok) {
    const map: Record<string, [string, number]> = {
      not_found: ['This link is not valid.', 404], revoked: ['This link has been superseded.', 410],
      used: ['This document has already been responded to.', 409], expired: ['This link has expired.', 410],
      already_accepted: ['This document has already been accepted.', 409],
    }
    const [msg, status] = map[res?.error ?? ''] ?? ['Submission failed.', 409]
    return { error: msg, status }
  }
  await logAudit({
    actor: null,
    action: params.action === 'decline' ? 'commercial.document_declined' : 'commercial.document_accepted',
    entityType: 'proforma', entityId: res.proforma_id ?? null, after: { name: params.name, email: params.email },
  })
  return { data: { action: res.action ?? params.action } }
}

/** Admin-recorded acceptance (offline). Requires a reason and evidence note. */
export async function adminRecordAcceptance(params: {
  proformaId: string; name: string; email: string; reason: string; evidence: string; actor: SessionUser
}): Promise<DomainResult<{ acceptanceId: string }>> {
  if (!params.reason || !params.evidence) return { error: 'Admin-recorded acceptance requires a reason and an evidence note.', status: 400 }
  const doc = await latestIssuedDocument(params.proformaId)
  if (!doc) return { error: 'This record has not been issued yet.', status: 409 }

  const { data: acc, error } = await supabaseAdmin.from('commercial_acceptances').insert({
    proforma_id: params.proformaId, issued_document_id: doc.id, document_type: doc.doc_type,
    document_number: doc.document_number, revision: doc.revision,
    accepted_by_name: params.name, accepted_by_email: params.email,
    acceptance_method: 'admin_recorded', acceptance_notes: params.reason, acceptance_evidence: params.evidence,
    recorded_by: params.actor.id,
  }).select('id').single()
  if (error || !acc) {
    if (error?.code === '23505') return { error: 'This revision already has a recorded acceptance.', status: 409 }
    return { error: 'Could not record acceptance.', status: 500 }
  }
  await supabaseAdmin.from('proformas').update({ acceptance_status: 'accepted' }).eq('id', params.proformaId)
  await logAudit({
    actor: params.actor, action: 'commercial.document_accepted', entityType: 'proforma', entityId: params.proformaId,
    after: { method: 'admin_recorded', name: params.name, revision: doc.revision },
  })
  return { data: { acceptanceId: acc.id } }
}
