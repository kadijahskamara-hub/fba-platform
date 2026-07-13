import 'server-only'
import { createHash } from 'crypto'
import { supabaseAdmin } from '../supabase'
import { logAudit } from '../audit'
import type { SessionUser } from '../types'
import type { DocumentFileEntityType, DocumentAudience } from './types'
import { commercialDocumentPdf } from './pdf/commercialDocumentPdf'
import { salesInvoicePdf } from './pdf/salesInvoicePdf'
import { purchaseOrderPdf } from './pdf/purchaseOrderPdf'
import { receiptPdf } from './pdf/receiptPdf'
import { creditNotePdf } from './pdf/creditNotePdf'
import { deliveryNotePdf, type DeliveryConfirmation } from './pdf/deliveryNotePdf'
import { statementPdf, type StatementModel } from './pdf/statementPdf'
import type { DeliveryNoteSnapshot } from './deliveryLogic'

// ============================================================
// Sprint 5 — server-generated PDF files: build → checksum →
// store (private bucket) → immutable version row. Regeneration
// creates version+1 and points the old row's superseded_by_id at
// it; old bytes are never overwritten.
// ============================================================

const BUCKET = 'issued-documents'
const ENGINE = 'jspdf@4'
const SIGNED_URL_TTL = 600 // 10 minutes

export interface DocumentFileRow {
  id: string
  entity_type: DocumentFileEntityType
  entity_id: string
  document_number: string
  revision: number
  audience: DocumentAudience | null
  version: number
  storage_path: string
  mime_type: string
  byte_size: number
  sha256: string
  engine: string
  generated_by: string | null
  generated_at: string
  superseded_by_id: string | null
}

type Snap = Record<string, unknown>

interface ResolvedSource {
  documentNumber: string
  revision: number
  build: (opts: { audience: DocumentAudience | null; confirmation?: DeliveryConfirmation | null }) => Buffer
}

/** Load the frozen snapshot for an entity and return a builder bound to it. */
async function resolveSource(
  entityType: DocumentFileEntityType,
  entityId: string,
): Promise<ResolvedSource | { error: string; status: number }> {
  switch (entityType) {
    case 'issued_document': {
      const { data } = await supabaseAdmin.from('issued_documents')
        .select('document_number, revision, snapshot').eq('id', entityId).single()
      if (!data) return { error: 'Issued document not found', status: 404 }
      return {
        documentNumber: data.document_number, revision: Number(data.revision ?? 1),
        build: () => commercialDocumentPdf(data.snapshot as Snap),
      }
    }
    case 'sales_invoice': {
      const { data } = await supabaseAdmin.from('sales_invoice_snapshots')
        .select('invoice_number, snapshot').eq('sales_invoice_id', entityId)
        .order('issued_at', { ascending: false }).limit(1).maybeSingle()
      if (!data) return { error: 'Invoice must be issued before a PDF can be generated', status: 409 }
      return {
        documentNumber: data.invoice_number, revision: 1,
        build: () => salesInvoicePdf(data.snapshot as Snap),
      }
    }
    case 'purchase_order': {
      const { data } = await supabaseAdmin.from('purchase_order_snapshots')
        .select('document_number, revision, snapshot').eq('purchase_order_id', entityId)
        .order('revision', { ascending: false }).limit(1).maybeSingle()
      if (!data) return { error: 'Purchase order must be issued before a PDF can be generated', status: 409 }
      return {
        documentNumber: data.document_number, revision: Number(data.revision ?? 1),
        build: () => purchaseOrderPdf(data.snapshot as Snap),
      }
    }
    case 'payment_receipt': {
      const { data } = await supabaseAdmin.from('payment_receipts')
        .select('receipt_number, snapshot').eq('id', entityId).single()
      if (!data) return { error: 'Receipt not found', status: 404 }
      return {
        documentNumber: data.receipt_number, revision: 1,
        build: () => receiptPdf(data.snapshot as Snap),
      }
    }
    case 'credit_note': {
      const { data } = await supabaseAdmin.from('credit_note_snapshots')
        .select('credit_note_number, snapshot').eq('credit_note_id', entityId)
        .order('issued_at', { ascending: false }).limit(1).maybeSingle()
      if (!data) return { error: 'Credit note must be issued before a PDF can be generated', status: 409 }
      return {
        documentNumber: data.credit_note_number, revision: 1,
        build: () => creditNotePdf(data.snapshot as Snap, data.credit_note_number),
      }
    }
    case 'delivery_note': {
      const { data } = await supabaseAdmin.from('delivery_note_snapshots')
        .select('delivery_number, snapshot').eq('delivery_id', entityId).single()
      if (!data) return { error: 'Delivery must be dispatched before a delivery note can be generated', status: 409 }
      return {
        documentNumber: data.delivery_number, revision: 1,
        build: (opts) => deliveryNotePdf(
          data.snapshot as unknown as DeliveryNoteSnapshot,
          { audience: (opts.audience ?? 'client') as DeliveryNoteAudienceLike, confirmation: opts.confirmation ?? null },
        ),
      }
    }
    default:
      return { error: 'Unsupported entity type for direct generation', status: 400 }
  }
}

// local alias to avoid importing the union just for a cast
type DeliveryNoteAudienceLike = 'client' | 'site' | 'manufacturer'

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

function storagePath(entityType: string, documentNumber: string, version: number, audience: string | null): string {
  const safe = documentNumber.replace(/[^A-Za-z0-9._-]/g, '_')
  const aud = audience ? `-${audience}` : ''
  return `${entityType}/${safe}/v${version}${aud}.pdf`
}

/** The current (non-superseded) file for an entity + audience, if any. */
export async function currentDocumentFile(
  entityType: DocumentFileEntityType, entityId: string, audience: DocumentAudience | null,
): Promise<DocumentFileRow | null> {
  let q = supabaseAdmin.from('document_files').select('*')
    .eq('entity_type', entityType).eq('entity_id', entityId).is('superseded_by_id', null)
  q = audience ? q.eq('audience', audience) : q.is('audience', null)
  const { data } = await q.order('version', { ascending: false }).limit(1)
  return (data?.[0] as DocumentFileRow) ?? null
}

/** Full version chain (newest first) for an entity (+ optional audience). */
export async function documentVersionChain(
  entityType: DocumentFileEntityType, entityId: string, audience?: DocumentAudience | null,
): Promise<DocumentFileRow[]> {
  let q = supabaseAdmin.from('document_files').select('*')
    .eq('entity_type', entityType).eq('entity_id', entityId)
  if (audience !== undefined) q = audience ? q.eq('audience', audience) : q.is('audience', null)
  const { data } = await q.order('version', { ascending: false })
  return (data ?? []) as DocumentFileRow[]
}

export interface GenerateParams {
  entityType: DocumentFileEntityType
  entityId: string
  audience?: DocumentAudience | null
  actor: SessionUser
  regenerate?: boolean
  confirmation?: DeliveryConfirmation | null
}

export async function generateDocumentFile(
  params: GenerateParams,
): Promise<{ file: DocumentFileRow; created: boolean } | { error: string; status: number }> {
  const { entityType, entityId, actor } = params
  const audience = params.audience ?? null

  if (entityType === 'delivery_note' && !audience) {
    return { error: 'Delivery notes require an audience (client, site or manufacturer)', status: 400 }
  }
  if (entityType === 'statement') {
    return { error: 'Use generateStatementFile for statements', status: 400 }
  }

  // Idempotent: return the current version unless a regenerate was asked for.
  const existing = await currentDocumentFile(entityType, entityId, audience)
  if (existing && !params.regenerate) return { file: existing, created: false }

  const src = await resolveSource(entityType, entityId)
  if ('error' in src) return src

  let buffer: Buffer
  try {
    buffer = src.build({ audience, confirmation: params.confirmation ?? null })
  } catch (e) {
    return { error: (e as Error).message || 'PDF generation failed', status: 422 }
  }

  const version = existing ? existing.version + 1 : 1
  const path = storagePath(entityType, src.documentNumber, version, audience)
  const digest = sha256(buffer)

  const { error: upErr } = await supabaseAdmin.storage.from(BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf', upsert: false })
  if (upErr) return { error: `Storage upload failed: ${upErr.message}`, status: 500 }

  const { data: row, error: insErr } = await supabaseAdmin.from('document_files').insert({
    entity_type: entityType, entity_id: entityId,
    document_number: src.documentNumber, revision: src.revision, audience,
    version, storage_path: path, mime_type: 'application/pdf',
    byte_size: buffer.byteLength, sha256: digest, engine: ENGINE,
    generated_by: actor.id,
  }).select().single()
  if (insErr || !row) {
    // best-effort cleanup of the just-uploaded object
    await supabaseAdmin.storage.from(BUCKET).remove([path])
    return { error: insErr?.message ?? 'Could not record generated file', status: 500 }
  }

  // Point the previous current version at the new one (only mutation the
  // immutability trigger permits).
  if (existing) {
    await supabaseAdmin.from('document_files')
      .update({ superseded_by_id: row.id }).eq('id', existing.id)
  }

  await logAudit({
    actor, action: 'commercial.document_generated', entityType: 'document_file', entityId: row.id,
    after: { entity_type: entityType, entity_id: entityId, audience, version, sha256: digest, byte_size: buffer.byteLength },
  })

  return { file: row as DocumentFileRow, created: true }
}

/** Statements are built from a live-computed model, not a stored snapshot. */
export async function generateStatementFile(params: {
  clientId: string
  model: StatementModel
  actor: SessionUser
  regenerate?: boolean
}): Promise<{ file: DocumentFileRow; created: boolean } | { error: string; status: number }> {
  const { clientId, model, actor } = params
  const existing = await currentDocumentFile('statement', clientId, null)
  if (existing && !params.regenerate) return { file: existing, created: false }

  let buffer: Buffer
  try { buffer = statementPdf(model) }
  catch (e) { return { error: (e as Error).message || 'Statement generation failed', status: 422 } }

  const version = existing ? existing.version + 1 : 1
  const path = storagePath('statement', model.documentNumber, version, null)
  const digest = sha256(buffer)

  const { error: upErr } = await supabaseAdmin.storage.from(BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf', upsert: false })
  if (upErr) return { error: `Storage upload failed: ${upErr.message}`, status: 500 }

  const { data: row, error: insErr } = await supabaseAdmin.from('document_files').insert({
    entity_type: 'statement', entity_id: clientId, document_number: model.documentNumber, revision: 1,
    audience: null, version, storage_path: path, mime_type: 'application/pdf',
    byte_size: buffer.byteLength, sha256: digest, engine: ENGINE, generated_by: actor.id,
  }).select().single()
  if (insErr || !row) {
    await supabaseAdmin.storage.from(BUCKET).remove([path])
    return { error: insErr?.message ?? 'Could not record statement', status: 500 }
  }
  if (existing) {
    await supabaseAdmin.from('document_files').update({ superseded_by_id: row.id }).eq('id', existing.id)
  }
  await logAudit({
    actor, action: 'commercial.document_generated', entityType: 'document_file', entityId: row.id,
    after: { entity_type: 'statement', entity_id: clientId, version, sha256: digest },
  })
  return { file: row as DocumentFileRow, created: true }
}

/** Short-lived signed URL for a staff download; the issue is audited. */
export async function signedDownloadUrl(
  fileId: string, actor: SessionUser,
): Promise<{ url: string; file: DocumentFileRow } | { error: string; status: number }> {
  const { data: file } = await supabaseAdmin.from('document_files').select('*').eq('id', fileId).single()
  if (!file) return { error: 'File not found', status: 404 }
  const { data, error } = await supabaseAdmin.storage.from(BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_URL_TTL)
  if (error || !data?.signedUrl) return { error: 'Could not create download link', status: 500 }
  await logAudit({
    actor, action: 'commercial.document_downloaded', entityType: 'document_file', entityId: fileId,
    after: { storage_path: file.storage_path, version: file.version },
  })
  return { url: data.signedUrl, file: file as DocumentFileRow }
}

/** Re-hash the stored bytes and compare to the recorded checksum. */
export async function verifyDocumentFile(
  fileId: string,
): Promise<{ match: boolean; expected: string; actual: string; byte_size: number; stored_byte_size: number } | { error: string; status: number }> {
  const { data: file } = await supabaseAdmin.from('document_files').select('*').eq('id', fileId).single()
  if (!file) return { error: 'File not found', status: 404 }
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(file.storage_path)
  if (error || !data) return { error: 'Stored file could not be read', status: 500 }
  const buf = Buffer.from(await data.arrayBuffer())
  const actual = sha256(buf)
  return {
    match: actual === file.sha256 && buf.byteLength === file.byte_size,
    expected: file.sha256, actual, byte_size: buf.byteLength, stored_byte_size: file.byte_size,
  }
}
