import 'server-only'
import { supabaseAdmin } from '../supabase'
import { getCommercialSettings } from './settings'
import { recalculateAndPersist } from './recalc'
import { nextInvoiceNumber, nextQuoteNumber, withRevision } from './numbering'
import type { SessionUser } from '../types'
import type { IssuedDocType } from './types'

// ============================================================
// Issue-time snapshots.
//
// Issuing a quote / pro forma / invoice freezes a complete,
// immutable JSON snapshot in issued_documents (DB triggers block
// UPDATE/DELETE). Documents are always rendered from a snapshot,
// never from the live mutable record, so historic documents can
// never change silently.
// ============================================================

export interface IssuedDocumentRow {
  id: string
  proforma_id: string
  doc_type: IssuedDocType
  document_number: string
  revision: number
  snapshot: Record<string, unknown>
  issued_by: string | null
  issued_at: string
}

/**
 * Build and store a frozen snapshot for an issue event.
 * Recalculates server-side first (never trusts stored/browser totals),
 * assigns document numbers where needed, and locks the source record.
 */
export async function issueDocument(params: {
  proformaId: string
  docType: IssuedDocType
  actor: SessionUser
}): Promise<{ doc: IssuedDocumentRow } | { error: string; status: number }> {
  const { proformaId, docType, actor } = params

  // Fresh authoritative calculation. (Refuses if already locked.)
  const { data: pfCheck } = await supabaseAdmin
    .from('proformas').select('id, locked_at, document_status').eq('id', proformaId).single()
  if (!pfCheck) return { error: 'Document not found', status: 404 }

  let pf: Record<string, unknown>

  if (pfCheck.locked_at) {
    // Already-issued records may still issue *downstream* documents
    // (e.g. a pro forma or invoice from an issued quote) using the
    // stored, frozen values.
    const { data } = await supabaseAdmin.from('proformas').select('*').eq('id', proformaId).single()
    if (!data) return { error: 'Document not found', status: 404 }
    pf = data
  } else {
    const recalc = await recalculateAndPersist(proformaId)
    if ('error' in recalc) return recalc
    const { data } = await supabaseAdmin.from('proformas').select('*').eq('id', proformaId).single()
    if (!data) return { error: 'Document not found', status: 404 }
    pf = data

    // Approval gate: a document that requires approval cannot be issued.
    const status = data.approval_status as string
    if (status === 'blocked') return { error: 'This document contains a blocked (negative-margin) line. Ultra Admin approval is required before issue.', status: 409 }
    if (status === 'required_commercial' || status === 'required_ultra') {
      return { error: 'This document requires approval before it can be issued.', status: 409 }
    }
  }

  const revision = Number(pf.revision_number ?? 1)

  // ── Document number ──
  let documentNumber: string
  if (docType === 'quote') {
    let qn = pf.quote_number as string | null
    if (!qn) {
      qn = await nextQuoteNumber()
      await supabaseAdmin.from('proformas').update({ quote_number: qn }).eq('id', proformaId)
    }
    documentNumber = withRevision(qn, revision)
  } else if (docType === 'invoice' || docType === 'service_invoice') {
    let inv = pf.invoice_number as string | null
    if (!inv) {
      inv = await nextInvoiceNumber()
      await supabaseAdmin.from('proformas').update({
        invoice_number: inv,
        invoice_date: (pf.invoice_date as string) ?? new Date().toISOString().slice(0, 10),
        invoice_due_date: (pf.invoice_due_date as string) ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      }).eq('id', proformaId)
      pf.invoice_number = inv
    }
    documentNumber = inv
  } else {
    documentNumber = pf.proforma_number as string
  }

  const snapshot = await buildSnapshotPayload({
    pf, docType, documentNumber, revision, actorEmail: actor.email,
  })

  const { data: doc, error } = await supabaseAdmin
    .from('issued_documents')
    .insert({
      proforma_id: proformaId,
      doc_type: docType,
      document_number: documentNumber,
      revision,
      snapshot,
      issued_by: actor.id,
    })
    .select()
    .single()
  if (error || !doc) return { error: error?.message ?? 'Snapshot insert failed', status: 500 }

  // Lock the working record on first issue.
  if (!pfCheck.locked_at) {
    await supabaseAdmin.from('proformas').update({
      document_status: 'issued',
      issued_by: actor.id,
      issued_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', proformaId)
  }

  return { doc: doc as IssuedDocumentRow }
}

/**
 * Build the snapshot payload for a document. Used at issue time (then
 * frozen in issued_documents) and for watermarked draft previews.
 * Contains everything the renderer needs, including internal values;
 * the renderer decides per-audience what is client-safe to display.
 */
export async function buildSnapshotPayload(params: {
  pf: Record<string, unknown>
  docType: IssuedDocType
  documentNumber: string
  revision: number
  actorEmail: string
}): Promise<Record<string, unknown>> {
  const { pf, docType, documentNumber, revision, actorEmail } = params
  const proformaId = pf.id as string
  const totals = (pf.totals ?? {}) as Record<string, unknown>

  const { data: lines } = await supabaseAdmin
    .from('proforma_line_items')
    .select('*, manufacturer:artisans(id, name), product:products(images)')
    .eq('proforma_id', proformaId)
    .order('sort_order', { ascending: true })

  const settings = await getCommercialSettings()

  return {
    docType,
    documentNumber,
    revision,
    issuedAt: new Date().toISOString(),
    issuedByEmail: actorEmail,
    header: {
      quote_number: pf.quote_number ?? null,
      proforma_number: pf.proforma_number,
      invoice_number: pf.invoice_number ?? null,
      invoice_date: pf.invoice_date ?? null,
      invoice_due_date: pf.invoice_due_date ?? null,
      client_name: pf.client_name ?? null,
      client_email: pf.client_email ?? null,
      client_company: pf.client_company ?? null,
      billing_address: pf.billing_address ?? null,
      delivery_address: pf.delivery_address ?? null,
      project_name: pf.project_name ?? null,
      project_location: pf.project_location ?? null,
      currency: pf.currency ?? 'GBP',
      quote_date: pf.quote_date ?? null,
      valid_until: pf.valid_until ?? null,
      pricing_method: pf.pricing_method ?? 'markup',
      vat_rate: Number(pf.vat_rate ?? settings.default_vat_rate),
      deposit_percent: Number(pf.deposit_percent ?? settings.default_deposit_percent),
      deposit_basis: pf.deposit_basis ?? 'gross_total',
      lead_time: pf.lead_time ?? settings.default_lead_time,
      delivery_notes: pf.delivery_notes ?? null,
      payment_terms: pf.payment_terms ?? settings.default_payment_terms,
      notes: pf.notes ?? null,
    },
    lines: (lines ?? []).map((it: Record<string, unknown>) => ({
      id: it.id,
      line_type: it.line_type ?? 'product',
      is_bespoke: Boolean(it.is_bespoke),
      name: it.name,
      description: it.description ?? null,
      section: it.section ?? null,
      spec_details: it.spec_details ?? null,
      selected_finish: it.selected_finish ?? null,
      selected_fabric: it.selected_fabric ?? null,
      selected_size: it.selected_size ?? null,
      image_url: it.image_url ?? ((it.product as { images?: string[] } | null)?.images?.[0] ?? null),
      manufacturer_id: it.manufacturer_id ?? null,
      manufacturer_name: (it.manufacturer as { name?: string } | null)?.name ?? it.manufacturer_name ?? null,
      quantity: Number(it.quantity ?? 0),
      unit_of_measure: it.unit_of_measure ?? 'each',
      // Client-facing figures
      selling_price_unit: it.selling_price_unit == null ? null : Number(it.selling_price_unit),
      discount_amount: it.discount_amount == null ? 0 : Number(it.discount_amount),
      tax_category: it.tax_category ?? 'standard',
      tax_rate_snapshot: it.tax_rate_snapshot == null ? null : Number(it.tax_rate_snapshot),
      line_net_total: it.line_net_total == null ? null : Number(it.line_net_total),
      line_tax_total: it.line_tax_total == null ? null : Number(it.line_tax_total),
      line_gross_total: it.line_gross_total == null ? null : Number(it.line_gross_total),
      // Internal figures (renderer must NEVER show these on client documents)
      internal: {
        supplier_cost_unit: it.supplier_cost_unit == null ? null : Number(it.supplier_cost_unit),
        supplier_cost_source: it.supplier_cost_source ?? 'unavailable',
        pricing_method: it.pricing_method ?? null,
        pricing_percent: it.pricing_percent == null ? null : Number(it.pricing_percent),
        line_cost_total: it.line_cost_total == null ? null : Number(it.line_cost_total),
        internal_notes: it.internal_notes ?? null,
      },
      client_notes: it.notes ?? null,
      sort_order: it.sort_order ?? 0,
    })),
    totals,
    settings: {
      company_legal_name: settings.company_legal_name,
      company_registration_number: settings.company_registration_number,
      registered_address: settings.registered_address,
      invoice_email: settings.invoice_email,
      invoice_phone: settings.invoice_phone,
      vat_registered: settings.vat_registered,
      vat_number: settings.vat_number,
      bank_name: settings.bank_name,
      bank_account_name: settings.bank_account_name,
      bank_account_number: settings.bank_account_number,
      bank_sort_code: settings.bank_sort_code,
      default_payment_terms: settings.default_payment_terms,
      default_lead_time: settings.default_lead_time,
    },
  }
}

/** Latest issued snapshot of a given type for a document, if any. */
export async function latestIssuedDocument(proformaId: string, docType?: IssuedDocType): Promise<IssuedDocumentRow | null> {
  let q = supabaseAdmin
    .from('issued_documents')
    .select('*')
    .eq('proforma_id', proformaId)
    .order('issued_at', { ascending: false })
    .limit(1)
  if (docType) q = q.eq('doc_type', docType) as typeof q
  const { data } = await q
  return (data?.[0] as IssuedDocumentRow) ?? null
}
