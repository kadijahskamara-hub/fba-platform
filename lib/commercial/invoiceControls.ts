import 'server-only'
import { supabaseAdmin } from '../supabase'
import { logAudit } from '../audit'
import type { SessionUser } from '../types'

// ============================================================
// Controlled invoice cancellation + replacement (Sprint 6).
//
// Void is permission-gated (`invoice_void`) and blocked in SQL when:
//   • confirmed payments or credit allocations exist (reverse first)
//   • the invoice's tax period is locked (use a credit note instead)
// Replacement clones the (voided) invoice into a fresh draft and
// cross-references both ways. The duplicate-invoice unique index
// excludes void/cancelled rows, so the clone is permitted.
// ============================================================

interface DomainErr { error: string; status: number }
export type DomainResult<T> = { data: T } | DomainErr
export function isErr<T>(r: DomainResult<T>): r is DomainErr { return (r as DomainErr).error !== undefined }

const VOID_ERRORS: Record<string, string> = {
  reason_required: 'A reason is required to void an invoice.',
  not_found: 'Invoice not found.',
  not_issued: 'Only an issued invoice can be voided (delete or edit a draft instead).',
  already_void: 'This invoice is already void.',
  has_payments: 'Reverse the confirmed payment(s) before voiding this invoice.',
  has_credits: 'Unallocate the credit note(s) before voiding this invoice.',
  period_locked: 'This invoice is in a closed accounting period; raise a credit note instead of voiding.',
}

export async function voidInvoice(invoiceId: string, reason: string, actor: SessionUser): Promise<DomainResult<{ invoiceNumber: string }>> {
  const { data, error } = await supabaseAdmin.rpc('void_sales_invoice', { p_invoice: invoiceId, p_reason: reason, p_actor: actor.id })
  if (error) return { error: `Void failed: ${error.message}`, status: 500 }
  const res = data as { ok: boolean; error?: string; invoice_number?: string }
  if (!res?.ok) return { error: VOID_ERRORS[res?.error ?? ''] ?? res?.error ?? 'Void failed', status: 409 }
  await logAudit({ actor, action: 'commercial.invoice_voided', entityType: 'sales_invoice', entityId: invoiceId, after: { reason, invoiceNumber: res.invoice_number } })
  return { data: { invoiceNumber: res.invoice_number! } }
}

/** Clone an invoice into a new draft; cross-reference both ways. */
export async function replaceInvoice(invoiceId: string, actor: SessionUser): Promise<DomainResult<{ invoiceId: string }>> {
  const { data: src } = await supabaseAdmin.from('sales_invoices').select('*').eq('id', invoiceId).single()
  if (!src) return { error: 'Invoice not found', status: 404 }
  if (src.replaced_by_invoice_id) return { error: 'This invoice already has a replacement.', status: 409 }

  const { data: draft, error } = await supabaseAdmin.from('sales_invoices').insert({
    invoice_type: src.invoice_type,
    commercial_order_id: src.commercial_order_id,
    source_proforma_id: src.source_proforma_id,
    source_issued_document_id: src.source_issued_document_id,
    source_revision: src.source_revision,
    client_id: src.client_id,
    project_id: src.project_id,
    currency: src.currency,
    status: 'draft',
    billing_address_snapshot: src.billing_address_snapshot,
    delivery_address_snapshot: src.delivery_address_snapshot,
    client_snapshot: src.client_snapshot,
    project_snapshot: src.project_snapshot,
    payment_terms_snapshot: src.payment_terms_snapshot,
    subtotal: src.subtotal, tax_total: src.tax_total, gross_total: src.gross_total,
    balance_due: src.gross_total,
    replaces_invoice_id: invoiceId,
    created_by: actor.id,
  }).select().single()
  if (error || !draft) return { error: error?.message ?? 'Could not create replacement draft', status: 500 }

  const { data: lines } = await supabaseAdmin.from('sales_invoice_lines').select('*').eq('sales_invoice_id', invoiceId).order('sort_order')
  for (const l of lines ?? []) {
    await supabaseAdmin.from('sales_invoice_lines').insert({
      sales_invoice_id: draft.id,
      source_line_item_id: l.source_line_item_id, line_type: l.line_type,
      product_id: l.product_id, service_catalogue_id: l.service_catalogue_id,
      name_snapshot: l.name_snapshot, description_snapshot: l.description_snapshot,
      specification_snapshot: l.specification_snapshot, quantity: l.quantity,
      unit_of_measure: l.unit_of_measure, unit_price: l.unit_price, discount_amount: l.discount_amount,
      tax_category: l.tax_category, tax_rate_snapshot: l.tax_rate_snapshot,
      line_net_total: l.line_net_total, line_tax_total: l.line_tax_total, line_gross_total: l.line_gross_total,
      sort_order: l.sort_order,
    })
  }
  await supabaseAdmin.from('sales_invoices').update({ replaced_by_invoice_id: draft.id, updated_at: new Date().toISOString() }).eq('id', invoiceId)
  await logAudit({ actor, action: 'commercial.invoice_replaced', entityType: 'sales_invoice', entityId: invoiceId, after: { replacementId: draft.id } })
  return { data: { invoiceId: draft.id } }
}
