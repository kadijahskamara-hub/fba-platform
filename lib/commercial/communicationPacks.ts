import 'server-only'
import { supabaseAdmin } from '../supabase'
import { logAudit } from '../audit'
import { getCommercialSettings } from './settings'
import { generateDocumentFile, currentDocumentFile, type DocumentFileRow } from './documentFiles'
import {
  renderTemplate, normalizeRecipients, validateAttachmentScope,
  canEditPack, type RecipientsSnapshot, type PackStatus,
} from './communications'
import type { SessionUser } from '../types'
import type { DocumentFileEntityType, DocumentAudience, CommunicationPackType } from './types'

// ============================================================
// Prepared communications — assemble a downloadable pack (suggested
// recipients + rendered subject/body + attached PDF versions). The
// platform NEVER sends: staff download the pack, send from their own
// mailbox, then mark it sent. Every step is an atomic, logged event.
// ============================================================

const BUCKET = 'issued-documents'

export interface PackEntities {
  commercial_order_id?: string | null
  proforma_id?: string | null
  sales_invoice_id?: string | null
  purchase_order_id?: string | null
  delivery_id?: string | null
  trade_application_id?: string | null
}

export interface AttachmentSpec {
  entityType: DocumentFileEntityType
  entityId: string
  audience?: DocumentAudience | null
}

export interface PackRow {
  id: string
  pack_number: string
  pack_type: CommunicationPackType
  template_key: string
  template_version: number
  recipients_snapshot: RecipientsSnapshot
  subject: string
  body: string
  attachment_file_ids: string[]
  status: PackStatus
  attention_note: string | null
  version: number
  superseded_by_id: string | null
  commercial_order_id: string | null
  proforma_id: string | null
  sales_invoice_id: string | null
  purchase_order_id: string | null
  delivery_id: string | null
  trade_application_id: string | null
  created_at: string
}

type Result<T> = { data: T } | { error: string; status: number }

const SYMBOL: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' }
function fmtMoney(n: unknown, currency = 'GBP'): string {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  return `${SYMBOL[currency] ?? currency + ' '}${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Context resolution: recipients + variables from the entity ──

interface Context {
  recipients: RecipientsSnapshot
  vars: Record<string, string>
  documentNumber: string | null
}

async function resolveContext(entities: PackEntities): Promise<Context> {
  const vars: Record<string, string> = {}
  const to: string[] = []
  const cc: string[] = []
  const names: Record<string, string> = {}
  let documentNumber: string | null = null

  if (entities.sales_invoice_id) {
    const { data } = await supabaseAdmin.from('sales_invoices')
      .select('invoice_number, currency, balance_due, due_date, client_snapshot').eq('id', entities.sales_invoice_id).single()
    if (data) {
      const csn = (data.client_snapshot ?? {}) as Record<string, unknown>
      if (csn.email) { to.push(String(csn.email)); if (csn.name) names[String(csn.email)] = String(csn.name) }
      if (csn.name) vars.client_name = String(csn.name)
      vars.document_number = data.invoice_number ?? ''
      vars.balance_due = fmtMoney(data.balance_due, data.currency ?? 'GBP')
      if (data.due_date) vars.due_date = String(data.due_date)
      documentNumber = data.invoice_number ?? null
    }
  } else if (entities.proforma_id) {
    const { data } = await supabaseAdmin.from('proformas')
      .select('proforma_number, quote_number, client_name, client_email, valid_until, currency, totals').eq('id', entities.proforma_id).single()
    if (data) {
      if (data.client_email) { to.push(String(data.client_email)); if (data.client_name) names[String(data.client_email)] = String(data.client_name) }
      if (data.client_name) vars.client_name = String(data.client_name)
      vars.document_number = data.quote_number ?? data.proforma_number ?? ''
      if (data.valid_until) vars.valid_until = String(data.valid_until)
      const totals = (data.totals ?? {}) as Record<string, unknown>
      if (totals.balanceDue != null) vars.balance_due = fmtMoney(totals.balanceDue, data.currency ?? 'GBP')
      documentNumber = data.quote_number ?? data.proforma_number ?? null
    }
  } else if (entities.commercial_order_id) {
    const { data } = await supabaseAdmin.from('commercial_orders')
      .select('order_number, client_snapshot').eq('id', entities.commercial_order_id).single()
    if (data) {
      const csn = (data.client_snapshot ?? {}) as Record<string, unknown>
      if (csn.email) { to.push(String(csn.email)); if (csn.name) names[String(csn.email)] = String(csn.name) }
      if (csn.name) vars.client_name = String(csn.name)
      documentNumber = data.order_number ?? null
    }
  }

  if (entities.purchase_order_id) {
    const { data } = await supabaseAdmin.from('purchase_orders')
      .select('purchase_order_number, supplier_recipient_email, cc_emails, supplier_contact_snapshot').eq('id', entities.purchase_order_id).single()
    if (data) {
      const contact = (data.supplier_contact_snapshot ?? {}) as Record<string, unknown>
      if (data.supplier_recipient_email) to.push(String(data.supplier_recipient_email))
      for (const e of (data.cc_emails ?? []) as string[]) cc.push(String(e))
      if (contact.name) { vars.recipient_name = String(contact.name); if (data.supplier_recipient_email) names[String(data.supplier_recipient_email)] = String(contact.name) }
      vars.document_number = data.purchase_order_number ?? ''
      documentNumber = documentNumber ?? data.purchase_order_number ?? null
    }
  }

  if (entities.delivery_id) {
    const { data: del } = await supabaseAdmin.from('deliveries')
      .select('delivery_number, delivery_location_id, commercial_order_id').eq('id', entities.delivery_id).single()
    if (del) {
      vars.document_number = del.delivery_number ?? ''
      documentNumber = documentNumber ?? del.delivery_number ?? null
      if (del.delivery_location_id) {
        const { data: contacts } = await supabaseAdmin.from('site_contacts')
          .select('name, email, is_primary').eq('delivery_location_id', del.delivery_location_id)
        for (const c of contacts ?? []) {
          if (c.email) { to.push(String(c.email)); if (c.name) names[String(c.email)] = String(c.name) }
          if (c.is_primary && c.name && !vars.recipient_name) vars.recipient_name = String(c.name)
        }
      }
      if (!vars.recipient_name) vars.recipient_name = 'Site team'
    }
  }

  
  if (entities.trade_application_id) {
    const { data } = await supabaseAdmin.from('trade_applications')
      .select('company_name, user:users!trade_applications_user_id_fkey(first_name, last_name, email)')
      .eq('id', entities.trade_application_id).single()
    if (data) {
      const u = (data.user ?? {}) as unknown as Record<string, unknown>
      const applicantEmail = u.email ? String(u.email) : null
      const applicantName = [u.first_name, u.last_name].filter(Boolean).join(' ')
      if (applicantEmail) { to.push(applicantEmail); if (applicantName) names[applicantEmail] = applicantName }
      if (applicantName) vars.client_name = applicantName
      if (data.company_name) vars.applicant_company = String(data.company_name)
    }
  }

  return { recipients: normalizeRecipients({ to, cc, names }), vars, documentNumber }
}

// ── Ensure attachments exist (idempotent generation) ───────

async function ensureAttachments(
  specs: AttachmentSpec[], actor: SessionUser, confirmation?: { url: string; qrDataUri?: string | null } | null,
): Promise<Result<DocumentFileRow[]>> {
  const files: DocumentFileRow[] = []
  for (const spec of specs) {
    const res = await generateDocumentFile({
      entityType: spec.entityType, entityId: spec.entityId, audience: spec.audience ?? null,
      actor, confirmation: confirmation ?? null,
    })
    if ('error' in res) return { error: `Attachment (${spec.entityType}): ${res.error}`, status: res.status }
    files.push(res.file)
  }
  return { data: files }
}

// ── Prepare a pack ─────────────────────────────────────────

export interface PrepareRequest {
  templateKey: string
  entities: PackEntities
  attachments: AttachmentSpec[]
  actor: SessionUser
  varsExtra?: Record<string, string>
  confirmation?: { url: string; qrDataUri?: string | null } | null
}

export async function preparePack(req: PrepareRequest): Promise<Result<PackRow>> {
  const { data: tpl } = await supabaseAdmin.from('communication_templates')
    .select('template_key, audience, subject_template, body_template, version')
    .eq('template_key', req.templateKey).eq('is_active', true).single()
  if (!tpl) return { error: `Unknown or inactive template: ${req.templateKey}`, status: 404 }

  const hasEntity = Object.values(req.entities).some(Boolean)
  if (!hasEntity) return { error: 'A pack must reference at least one entity', status: 400 }

  const settings = await getCommercialSettings()
  const ctx = await resolveContext(req.entities)

  const att = await ensureAttachments(req.attachments, req.actor, req.confirmation)
  if ('error' in att) return att

  const vars: Record<string, string> = {
    company_name: settings.company_legal_name,
    ...ctx.vars,
    ...(req.varsExtra ?? {}),
  }
  if (!vars.document_number && ctx.documentNumber) vars.document_number = ctx.documentNumber

  const rendered = renderTemplate(tpl.subject_template, tpl.body_template, vars)

  const { data: numData, error: numErr } = await supabaseAdmin.rpc('next_communication_number')
  if (numErr || !numData) return { error: 'Could not allocate a pack number', status: 500 }

  const { data: pack, error } = await supabaseAdmin.from('communication_packs').insert({
    pack_number: numData as string,
    pack_type: tpl.audience,
    template_key: tpl.template_key,
    template_version: tpl.version,
    commercial_order_id: req.entities.commercial_order_id ?? null,
    proforma_id: req.entities.proforma_id ?? null,
    sales_invoice_id: req.entities.sales_invoice_id ?? null,
    purchase_order_id: req.entities.purchase_order_id ?? null,
    delivery_id: req.entities.delivery_id ?? null,
    trade_application_id: req.entities.trade_application_id ?? null,
    recipients_snapshot: ctx.recipients,
    subject: rendered.subject,
    body: rendered.body,
    attachment_file_ids: att.data.map(f => f.id),
    status: 'prepared',
    created_by: req.actor.id,
  }).select().single()
  if (error || !pack) return { error: error?.message ?? 'Could not create pack', status: 500 }

  await supabaseAdmin.from('communication_events').insert({
    pack_id: pack.id, event: 'prepared', actor_id: req.actor.id,
    detail: {
      template_key: tpl.template_key, template_version: tpl.version,
      missing_variables: rendered.missing,
      attachments: att.data.map(f => ({ id: f.id, sha256: f.sha256, document_number: f.document_number, audience: f.audience })),
    },
  })

  await logAudit({
    actor: req.actor, action: 'commercial.communication_prepared', entityType: 'communication_pack',
    entityId: pack.id, after: { pack_number: pack.pack_number, template_key: tpl.template_key },
  })

  return { data: pack as PackRow }
}

// ── Allowed attachment ids for a pack (scope guard) ────────

export async function allowedAttachmentIds(pack: PackRow): Promise<string[]> {
  const conds: Array<{ entity_type: DocumentFileEntityType; entity_id: string }> = []
  if (pack.sales_invoice_id) conds.push({ entity_type: 'sales_invoice', entity_id: pack.sales_invoice_id })
  if (pack.proforma_id) {
    const { data } = await supabaseAdmin.from('issued_documents').select('id').eq('proforma_id', pack.proforma_id)
    for (const d of data ?? []) conds.push({ entity_type: 'issued_document', entity_id: d.id })
  }
  if (pack.purchase_order_id) conds.push({ entity_type: 'purchase_order', entity_id: pack.purchase_order_id })
  if (pack.delivery_id) conds.push({ entity_type: 'delivery_note', entity_id: pack.delivery_id })
  const ids: string[] = []
  for (const c of conds) {
    const { data } = await supabaseAdmin.from('document_files').select('id')
      .eq('entity_type', c.entity_type).eq('entity_id', c.entity_id)
    for (const d of data ?? []) ids.push(d.id)
  }
  return ids
}

// ── Edit a pack (pre-download only, allowlisted) ───────────

export async function applyPackEdit(
  packId: string, patch: { subject?: string; body?: string; recipients?: unknown; attachment_file_ids?: string[] }, actor: SessionUser,
): Promise<Result<PackRow>> {
  const { data: pack } = await supabaseAdmin.from('communication_packs').select('*').eq('id', packId).single()
  if (!pack) return { error: 'Pack not found', status: 404 }
  if (!canEditPack(pack.status as PackStatus)) {
    return { error: 'This pack can no longer be edited (already downloaded or closed). Re-prepare instead.', status: 409 }
  }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.subject !== undefined) update.subject = String(patch.subject).slice(0, 500)
  if (patch.body !== undefined) update.body = String(patch.body).slice(0, 20000)
  if (patch.recipients !== undefined) update.recipients_snapshot = normalizeRecipients(patch.recipients)
  if (patch.attachment_file_ids !== undefined) {
    const allowed = await allowedAttachmentIds(pack as PackRow)
    const scope = validateAttachmentScope(patch.attachment_file_ids, allowed)
    if (!scope.ok) return { error: `Attachments outside this pack's entities: ${scope.invalid.join(', ')}`, status: 400 }
    update.attachment_file_ids = scope.accepted
  }
  const { data: updated, error } = await supabaseAdmin.from('communication_packs')
    .update(update).eq('id', packId).select().single()
  if (error || !updated) return { error: error?.message ?? 'Edit failed', status: 500 }

  await supabaseAdmin.from('communication_events').insert({
    pack_id: packId, event: 'edited', actor_id: actor.id,
    detail: { fields: Object.keys(update).filter(k => k !== 'updated_at') },
  })
  return { data: updated as PackRow }
}

// ── Re-prepare (supersede) ─────────────────────────────────

export async function rePreparePack(
  oldPackId: string, actor: SessionUser, confirmation?: { url: string; qrDataUri?: string | null } | null,
): Promise<Result<PackRow>> {
  const { data: old } = await supabaseAdmin.from('communication_packs').select('*').eq('id', oldPackId).single()
  if (!old) return { error: 'Pack not found', status: 404 }
  if (old.status === 'superseded') return { error: 'Pack already superseded', status: 409 }

  // Rebuild attachment specs from the old attachments' source entities so the
  // new pack picks up the CURRENT document versions.
  const specs: AttachmentSpec[] = []
  if ((old.attachment_file_ids ?? []).length) {
    const { data: files } = await supabaseAdmin.from('document_files')
      .select('entity_type, entity_id, audience').in('id', old.attachment_file_ids as string[])
    const seen = new Set<string>()
    for (const f of files ?? []) {
      const key = `${f.entity_type}:${f.entity_id}:${f.audience ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      specs.push({ entityType: f.entity_type as DocumentFileEntityType, entityId: f.entity_id, audience: f.audience as DocumentAudience | null })
    }
  }

  const prepared = await preparePack({
    templateKey: old.template_key,
    entities: {
      commercial_order_id: old.commercial_order_id, proforma_id: old.proforma_id,
      sales_invoice_id: old.sales_invoice_id, purchase_order_id: old.purchase_order_id,
      delivery_id: old.delivery_id,
    },
    attachments: specs,
    actor, confirmation,
  })
  if ('error' in prepared) return prepared

  const { data: sup, error } = await supabaseAdmin.rpc('supersede_pack', {
    p_old: oldPackId, p_new: prepared.data.id, p_actor: actor.id,
  })
  if (error) return { error: `Supersede failed: ${error.message}`, status: 500 }
  const r = sup as { ok?: boolean; error?: string }
  if (!r?.ok) return { error: r?.error ?? 'Supersede failed', status: 409 }

  return { data: { ...prepared.data, version: (old.version ?? 1) + 1 } }
}

// ── Download bundle (.eml with PDF attachments; X-Unsent draft) ──

export async function buildDownloadBundle(
  packId: string, actor: SessionUser, format: 'eml' | 'txt' = 'eml',
): Promise<Result<{ filename: string; content: Buffer; contentType: string }>> {
  const { data: pack } = await supabaseAdmin.from('communication_packs').select('*').eq('id', packId).single()
  if (!pack) return { error: 'Pack not found', status: 404 }

  const recipients = normalizeRecipients(pack.recipients_snapshot)
  const { data: files } = await supabaseAdmin.from('document_files').select('*')
    .in('id', ((pack.attachment_file_ids ?? []) as string[]).length ? (pack.attachment_file_ids as string[]) : ['00000000-0000-0000-0000-000000000000'])

  if (format === 'txt') {
    const lines = [
      `To: ${recipients.to.join(', ')}`,
      recipients.cc.length ? `Cc: ${recipients.cc.join(', ')}` : '',
      `Subject: ${pack.subject}`,
      '', pack.body, '',
      `Attachments (send from the folder you downloaded): ${(files ?? []).map(f => f.storage_path.split('/').pop()).join(', ') || 'none'}`,
    ].filter(v => v !== '')
    await markDownloaded(pack, files ?? [], actor)
    return { data: { filename: `${pack.pack_number}.txt`, content: Buffer.from(lines.join('\r\n'), 'utf-8'), contentType: 'text/plain; charset=utf-8' } }
  }

  // .eml (RFC822) multipart/mixed with the PDFs base64-encoded inline.
  const boundary = `FBA-${pack.pack_number}-${Date.now().toString(36)}`
  const parts: string[] = []
  parts.push(`To: ${recipients.to.join(', ')}`)
  if (recipients.cc.length) parts.push(`Cc: ${recipients.cc.join(', ')}`)
  parts.push(`Subject: ${pack.subject}`)
  parts.push('X-Unsent: 1')                       // Outlook opens as an editable draft
  parts.push('MIME-Version: 1.0')
  parts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
  parts.push('')
  parts.push(`--${boundary}`)
  parts.push('Content-Type: text/plain; charset=utf-8')
  parts.push('Content-Transfer-Encoding: 8bit')
  parts.push('')
  parts.push(pack.body)

  for (const f of files ?? []) {
    const { data: blob } = await supabaseAdmin.storage.from(BUCKET).download(f.storage_path)
    if (!blob) continue
    const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64').replace(/(.{76})/g, '$1\r\n')
    const name = f.storage_path.split('/').pop() ?? 'document.pdf'
    parts.push(`--${boundary}`)
    parts.push(`Content-Type: application/pdf; name="${name}"`)
    parts.push('Content-Transfer-Encoding: base64')
    parts.push(`Content-Disposition: attachment; filename="${name}"`)
    parts.push('')
    parts.push(b64)
  }
  parts.push(`--${boundary}--`)

  await markDownloaded(pack, files ?? [], actor)
  return { data: { filename: `${pack.pack_number}.eml`, content: Buffer.from(parts.join('\r\n'), 'utf-8'), contentType: 'message/rfc822' } }
}

async function markDownloaded(pack: { id: string }, files: DocumentFileRow[], actor: SessionUser) {
  await supabaseAdmin.rpc('mark_pack_downloaded', {
    p_pack_id: pack.id, p_actor: actor.id,
    p_detail: { attachments: files.map(f => ({ id: f.id, sha256: f.sha256 })) },
  })
  await logAudit({
    actor, action: 'commercial.communication_downloaded', entityType: 'communication_pack', entityId: pack.id,
    after: { attachment_count: files.length },
  })
}

// ── Thin wrappers over the atomic status functions ─────────

export async function markPackSent(packId: string, actor: SessionUser, sentVia: string, note: string | null): Promise<Result<true>> {
  const { data, error } = await supabaseAdmin.rpc('mark_pack_sent', { p_pack_id: packId, p_actor: actor.id, p_sent_via: sentVia, p_note: note })
  if (error) return { error: error.message, status: 500 }
  const r = data as { ok?: boolean; error?: string }
  if (!r?.ok) return { error: r?.error ?? 'Could not mark sent', status: 409 }
  await logAudit({ actor, action: 'commercial.communication_marked_sent', entityType: 'communication_pack', entityId: packId, after: { sent_via: sentVia } })
  return { data: true }
}

export async function markPackNeedsAttention(packId: string, actor: SessionUser, note: string): Promise<Result<true>> {
  const { data, error } = await supabaseAdmin.rpc('mark_pack_needs_attention', { p_pack_id: packId, p_actor: actor.id, p_note: note })
  if (error) return { error: error.message, status: 500 }
  const r = data as { ok?: boolean; error?: string }
  if (!r?.ok) return { error: r?.error ?? 'Could not flag pack', status: 409 }
  await logAudit({ actor, action: 'commercial.communication_needs_attention', entityType: 'communication_pack', entityId: packId, after: { note } })
  return { data: true }
}
