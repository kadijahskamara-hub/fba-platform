import 'server-only'
import { supabaseAdmin } from '../supabase'
import { logAudit } from '../audit'
import { getCommercialSettings } from './settings'
import {
  calculateInvoice, calculateDeposit, remainingInvoiceable, assertInvoiceable,
  InvoiceLineInput, InvoiceType,
} from './invoiceCalculations'
import { toMinor, fromMinor } from './calculations'
import type { SessionUser } from '../types'
import type { TaxCategory } from './types'

// ============================================================
// Client sales-invoice orchestration (Sprint 3).
//
// Invoices are DEDICATED records (never the proformas working
// record). They carry client selling prices only — supplier cost,
// FBA markup and margin never enter an invoice line. Totals are
// server-calculated; issue is atomic (issue_sales_invoice) and
// produces an immutable snapshot; balances derive from allocations.
// ============================================================

interface DomainOk<T> { data: T }
interface DomainErr { error: string; status: number }
export type DomainResult<T> = DomainOk<T> | DomainErr
export function isErr<T>(r: DomainResult<T>): r is DomainErr { return (r as DomainErr).error !== undefined }

function taxRateFor(cat: TaxCategory, standardRate: number, reducedRate: number, snapshot: number | null): number {
  if (snapshot != null) return Number(snapshot)
  if (cat === 'standard') return standardRate
  if (cat === 'reduced') return reducedRate
  return 0
}

/** Aggregate the order's invoiceable position (spec §7). */
export async function orderInvoiceState(commercialOrderId: string) {
  const { data: order } = await supabaseAdmin
    .from('commercial_orders').select('*').eq('id', commercialOrderId).single()
  if (!order) return null

  const { data: pf } = await supabaseAdmin
    .from('proformas').select('totals').eq('id', order.source_proforma_id).single()
  const orderGross = Number((pf?.totals as Record<string, unknown> | null)?.grossTotal ?? 0)

  const { data: invoices } = await supabaseAdmin
    .from('sales_invoices')
    .select('id, invoice_number, invoice_type, status, gross_total, amount_paid, credit_total, balance_due, due_date, issued_at')
    .eq('commercial_order_id', commercialOrderId)
    .not('status', 'in', '(void,cancelled)')

  const priorInvoiced = (invoices ?? []).reduce((s, i) => s + Number(i.gross_total ?? 0), 0)
  const credited = (invoices ?? []).reduce((s, i) => s + Number(i.credit_total ?? 0), 0)
  const paid = (invoices ?? []).reduce((s, i) => s + Number(i.amount_paid ?? 0), 0)
  const outstanding = (invoices ?? []).reduce((s, i) => s + Number(i.balance_due ?? 0), 0)

  const remaining = remainingInvoiceable({ orderGross, approvedVariations: 0, priorInvoiced, creditNotes: 0 })

  return {
    order, orderGross, priorInvoiced, credited, paid, outstanding,
    remainingToInvoice: remaining, invoices: invoices ?? [],
  }
}

/** Create a draft invoice from an accepted commercial order. */
export async function createDraftInvoice(params: {
  commercialOrderId: string
  invoiceType: InvoiceType
  actor: SessionUser
  depositOverride?: number | null
  selectedLineIds?: string[] | null
  stageAmount?: number | null
}): Promise<DomainResult<{ invoice: Record<string, unknown> }>> {
  const { commercialOrderId, invoiceType, actor } = params
  const state = await orderInvoiceState(commercialOrderId)
  if (!state) return { error: 'Commercial order not found', status: 404 }
  const order = state.order

  // Conversion relies on accepted evidence (spec §22): the source
  // proforma must be accepted before invoicing beyond a deposit is allowed.
  const { data: pf } = await supabaseAdmin
    .from('proformas').select('*').eq('id', order.source_proforma_id).single()
  if (!pf) return { error: 'Source commercial record not found', status: 404 }
  if (pf.acceptance_status !== 'accepted' && invoiceType !== 'deposit') {
    return { error: 'The commercial record is not accepted. Record client acceptance before issuing stage/final invoices.', status: 409 }
  }

  const settings = await getCommercialSettings()
  const standardRate = Number(settings.default_vat_rate ?? 20)
  const reducedRate = 5
  const vatRegistered = Boolean(settings.vat_registered)

  // Build the client selling lines from the source proforma line items.
  const { data: srcLines } = await supabaseAdmin
    .from('proforma_line_items').select('*').eq('proforma_id', order.source_proforma_id)
    .order('sort_order', { ascending: true })

  let lineInputs: Array<InvoiceLineInput & { meta: Record<string, unknown> }> = []

  if (invoiceType === 'deposit') {
    const grossTotal = state.orderGross
    const netSubtotal = Number((pf.totals as Record<string, unknown> | null)?.netSubtotal ?? grossTotal)
    const depositGross = calculateDeposit({
      netSubtotal, grossTotal,
      depositPercent: Number(settings.default_deposit_percent ?? 0),
      basis: (settings.default_deposit_basis as 'gross_total' | 'net_subtotal') ?? 'gross_total',
      override: params.depositOverride ?? null,
    })
    // Split gross into net + VAT at the standard rate for a valid VAT invoice.
    const net = vatRegistered ? fromMinor(Math.round(toMinor(depositGross) / (1 + standardRate / 100))) : depositGross
    lineInputs = [{
      quantity: 1, unitPrice: net, discountAmount: 0,
      taxCategory: vatRegistered ? 'standard' : 'zero',
      taxRate: vatRegistered ? standardRate : 0,
      meta: { name_snapshot: `Deposit — order ${order.order_number}`, line_type: 'fee' },
    }]
  } else {
    const chosen = (srcLines ?? []).filter(l =>
      !params.selectedLineIds || params.selectedLineIds.includes(l.id as string))
    lineInputs = chosen.map(l => ({
      quantity: Number(l.quantity ?? 1),
      unitPrice: Number(l.selling_price_unit ?? l.unit_price ?? 0),
      discountAmount: Number(l.discount_amount ?? 0),
      taxCategory: (l.tax_category ?? 'standard') as TaxCategory,
      taxRate: taxRateFor((l.tax_category ?? 'standard') as TaxCategory, standardRate, reducedRate, l.tax_rate_snapshot as number | null),
      meta: {
        source_line_item_id: l.id, line_type: l.line_type ?? 'product', product_id: l.product_id,
        service_catalogue_id: l.service_catalogue_id,
        name_snapshot: l.name ?? 'Item', description_snapshot: l.description ?? null,
        specification_snapshot: l.spec_details ?? null, unit_of_measure: l.unit_of_measure ?? 'each',
      },
    }))
  }

  const calc = calculateInvoice({ vatRegistered, lines: lineInputs })

  // Over-invoicing guard (deposit is a prepayment, not counted against remaining).
  if (invoiceType !== 'deposit') {
    const guard = assertInvoiceable(calc.grossTotal, {
      orderGross: state.orderGross, approvedVariations: 0,
      priorInvoiced: state.priorInvoiced, creditNotes: 0,
    })
    if (!guard.ok) return { error: guard.error!, status: 409 }
  }

  const { data: invoice, error } = await supabaseAdmin.from('sales_invoices').insert({
    invoice_type: invoiceType,
    commercial_order_id: commercialOrderId,
    source_proforma_id: order.source_proforma_id,
    source_revision: pf.revision_number ?? 1,
    client_id: pf.contact_user_id ?? null,
    project_id: pf.project_id ?? null,
    currency: order.currency ?? 'GBP',
    status: 'draft',
    billing_address_snapshot: pf.billing_address ?? null,
    delivery_address_snapshot: pf.delivery_address ?? null,
    client_snapshot: { name: pf.client_name, email: pf.client_email, company: pf.client_company },
    project_snapshot: { name: pf.project_name },
    payment_terms_snapshot: settings.default_payment_terms ?? null,
    subtotal: calc.subtotal, tax_total: calc.taxTotal, gross_total: calc.grossTotal,
    balance_due: calc.grossTotal,
    created_by: actor.id,
  }).select().single()
  if (error || !invoice) return { error: 'Invoice creation failed.', status: 500 }

  let sort = 0
  for (let i = 0; i < calc.lines.length; i++) {
    const lr = calc.lines[i]
    const meta = lineInputs[i].meta
    await supabaseAdmin.from('sales_invoice_lines').insert({
      sales_invoice_id: invoice.id,
      source_line_item_id: meta.source_line_item_id ?? null,
      line_type: meta.line_type ?? 'product',
      product_id: meta.product_id ?? null,
      service_catalogue_id: meta.service_catalogue_id ?? null,
      name_snapshot: meta.name_snapshot ?? 'Item',
      description_snapshot: meta.description_snapshot ?? null,
      specification_snapshot: meta.specification_snapshot ?? null,
      quantity: lr.quantity, unit_of_measure: meta.unit_of_measure ?? 'each',
      unit_price: lr.unitPrice, discount_amount: lr.discountAmount,
      tax_category: lr.taxCategory, tax_rate_snapshot: lr.taxRate,
      line_net_total: lr.lineNetTotal, line_tax_total: lr.lineTaxTotal, line_gross_total: lr.lineGrossTotal,
      sort_order: sort++,
    })
  }

  await logAudit({
    actor, action: 'commercial.invoice_created', entityType: 'sales_invoice', entityId: invoice.id,
    after: { invoiceType, gross: calc.grossTotal, order: order.order_number },
  })
  return { data: { invoice } }
}

/** Recompute a DRAFT invoice's totals server-side. */
export async function recalcInvoice(invoiceId: string): Promise<DomainResult<{ subtotal: number; taxTotal: number; grossTotal: number }>> {
  const { data: inv } = await supabaseAdmin.from('sales_invoices').select('*').eq('id', invoiceId).single()
  if (!inv) return { error: 'Invoice not found', status: 404 }
  if (inv.locked_at) return { error: 'Issued invoices are immutable.', status: 409 }
  const settings = await getCommercialSettings()
  const { data: lines } = await supabaseAdmin
    .from('sales_invoice_lines').select('*').eq('sales_invoice_id', invoiceId).order('sort_order')
  const calc = calculateInvoice({
    vatRegistered: Boolean(settings.vat_registered),
    lines: (lines ?? []).map(l => ({
      quantity: Number(l.quantity), unitPrice: Number(l.unit_price),
      discountAmount: Number(l.discount_amount ?? 0),
      taxCategory: (l.tax_category ?? 'standard') as TaxCategory,
      taxRate: l.tax_rate_snapshot == null ? null : Number(l.tax_rate_snapshot),
    })),
  })
  for (let i = 0; i < calc.lines.length; i++) {
    const lr = calc.lines[i]; const row = (lines ?? [])[i]
    if (!row) continue
    await supabaseAdmin.from('sales_invoice_lines').update({
      line_net_total: lr.lineNetTotal, line_tax_total: lr.lineTaxTotal, line_gross_total: lr.lineGrossTotal,
    }).eq('id', row.id)
  }
  await supabaseAdmin.from('sales_invoices').update({
    subtotal: calc.subtotal, tax_total: calc.taxTotal, gross_total: calc.grossTotal,
    balance_due: calc.grossTotal - Number(inv.amount_paid ?? 0) - Number(inv.credit_total ?? 0),
    updated_at: new Date().toISOString(),
  }).eq('id', invoiceId)
  return { data: { subtotal: calc.subtotal, taxTotal: calc.taxTotal, grossTotal: calc.grossTotal } }
}

/** Build the immutable, client-safe issue snapshot (no supplier cost/margin). */
export async function buildInvoiceSnapshot(invoiceId: string): Promise<Record<string, unknown> | null> {
  const { data: inv } = await supabaseAdmin.from('sales_invoices').select('*').eq('id', invoiceId).single()
  if (!inv) return null
  const settings = await getCommercialSettings()
  const { data: lines } = await supabaseAdmin
    .from('sales_invoice_lines').select('*').eq('sales_invoice_id', invoiceId).order('sort_order')
  const dueDays = Number(settings.default_payment_terms_days ?? 30)
  const dueDate = new Date(Date.now() + dueDays * 86400000).toISOString().slice(0, 10)
  return {
    invoice_number: inv.invoice_number,
    invoice_type: inv.invoice_type,
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: dueDate,
    currency: inv.currency,
    client: inv.client_snapshot,
    project: inv.project_snapshot,
    billing_address: inv.billing_address_snapshot,
    company: {
      legal_name: settings.company_legal_name, registration_number: settings.company_registration_number,
      address: settings.registered_address, vat_number: settings.vat_number,
      email: settings.invoice_email, phone: settings.invoice_phone,
    },
    bank: {
      bank_name: settings.bank_name, account_name: settings.bank_account_name,
      account_number: settings.bank_account_number, sort_code: settings.bank_sort_code,
    },
    payment_terms: settings.default_payment_terms,
    lines: (lines ?? []).map(l => ({
      name: l.name_snapshot, description: l.description_snapshot, specification: l.specification_snapshot,
      quantity: Number(l.quantity), unit_of_measure: l.unit_of_measure,
      unit_price: Number(l.unit_price), discount_amount: Number(l.discount_amount ?? 0),
      tax_category: l.tax_category, tax_rate: Number(l.tax_rate_snapshot ?? 0),
      line_net_total: Number(l.line_net_total), line_tax_total: Number(l.line_tax_total),
      line_gross_total: Number(l.line_gross_total),
    })),
    totals: { subtotal: Number(inv.subtotal), tax_total: Number(inv.tax_total), gross_total: Number(inv.gross_total) },
  }
}

/** Atomically issue an invoice: number, snapshot, lock (via SQL function). */
export async function issueInvoice(invoiceId: string, actor: SessionUser): Promise<DomainResult<{ invoiceNumber: string; dueDate: string }>> {
  const { data: inv } = await supabaseAdmin.from('sales_invoices').select('*').eq('id', invoiceId).single()
  if (!inv) return { error: 'Invoice not found', status: 404 }
  if (inv.locked_at) return { error: 'Invoice is already issued.', status: 409 }
  if (Number(inv.gross_total) <= 0) return { error: 'Cannot issue a zero-value invoice.', status: 409 }

  const settings = await getCommercialSettings()
  const dueDays = Number(settings.default_payment_terms_days ?? 30)
  const dueDate = new Date(Date.now() + dueDays * 86400000).toISOString().slice(0, 10)
  await supabaseAdmin.from('sales_invoices').update({
    due_date: dueDate, tax_point_date: new Date().toISOString().slice(0, 10),
    company_snapshot: {
      legal_name: settings.company_legal_name, registration_number: settings.company_registration_number,
      address: settings.registered_address, vat_number: settings.vat_number, email: settings.invoice_email,
    },
    bank_snapshot: {
      bank_name: settings.bank_name, account_name: settings.bank_account_name,
      account_number: settings.bank_account_number, sort_code: settings.bank_sort_code,
    },
  }).eq('id', invoiceId)

  const snapshot = await buildInvoiceSnapshot(invoiceId)
  const { data, error } = await supabaseAdmin.rpc('issue_sales_invoice', {
    p_invoice_id: invoiceId, p_snapshot: snapshot, p_actor: actor.id,
  })
  if (error) return { error: `Issue failed: ${error.message}`, status: 500 }
  const res = data as { ok: boolean; error?: string; invoice_number?: string }
  if (!res?.ok) return { error: res?.error ?? 'Issue failed', status: 409 }

  await logAudit({
    actor, action: 'commercial.invoice_issued', entityType: 'sales_invoice', entityId: invoiceId,
    after: { invoiceNumber: res.invoice_number, dueDate },
  })
  return { data: { invoiceNumber: res.invoice_number!, dueDate } }
}

/** Void an invoice (before payment) with a reason. */
export async function voidInvoice(invoiceId: string, actor: SessionUser, reason: string): Promise<DomainResult<{ voided: true }>> {
  const { data: inv } = await supabaseAdmin.from('sales_invoices').select('*').eq('id', invoiceId).single()
  if (!inv) return { error: 'Invoice not found', status: 404 }
  if (Number(inv.amount_paid ?? 0) > 0) return { error: 'This invoice has payments allocated; use a credit note instead of voiding.', status: 409 }
  await supabaseAdmin.from('sales_invoices').update({
    status: 'void', voided_at: new Date().toISOString(), void_reason: reason, updated_at: new Date().toISOString(),
  }).eq('id', invoiceId)
  await logAudit({ actor, action: 'commercial.invoice_voided', entityType: 'sales_invoice', entityId: invoiceId, after: { reason } })
  return { data: { voided: true } }
}

// ── Pipeline invoice → ledger mirror (QA item 1) ─────────────
//
// The Quote Pipeline can issue an invoice document directly from the
// working proforma record. Historically that produced only an immutable
// issued_documents snapshot and never appeared in /admin/invoices. This
// mirrors the issued document into the sales_invoices ledger so there is
// exactly ONE coherent invoice ledger. Idempotent on invoice_number.
export async function mirrorProformaInvoiceToLedger(params: {
  proformaId: string
  issuedDocumentId: string
  docType: 'invoice' | 'service_invoice'
  actor: SessionUser
}): Promise<DomainResult<{ invoiceId: string; invoiceNumber: string; alreadyExisted: boolean }>> {
  const { proformaId, issuedDocumentId, docType, actor } = params

  const { data: pf } = await supabaseAdmin
    .from('proformas')
    .select('id, invoice_number, invoice_date, invoice_due_date, revision_number, contact_user_id, client_name, client_email, client_company, project_name, currency, totals')
    .eq('id', proformaId).single()
  if (!pf) return { error: 'Proforma not found', status: 404 }
  if (!pf.invoice_number) return { error: 'The document has no invoice number; convert it to an invoice first.', status: 409 }

  // Idempotency: one ledger record per invoice number.
  const { data: existing } = await supabaseAdmin
    .from('sales_invoices').select('id, invoice_number').eq('invoice_number', pf.invoice_number).maybeSingle()
  if (existing) return { data: { invoiceId: existing.id, invoiceNumber: existing.invoice_number, alreadyExisted: true } }

  // Link to the commercial order born from this proforma, when one exists.
  const { data: order } = await supabaseAdmin
    .from('commercial_orders').select('id, project_id').eq('source_proforma_id', proformaId).maybeSingle()

  const totals = (pf.totals ?? {}) as Record<string, unknown>
  const netSubtotal = Number(totals.netSubtotal ?? 0)
  const vatTotal = Number(totals.vatTotal ?? 0)
  const grossTotal = Number(totals.grossTotal ?? 0)
  const now = new Date().toISOString()

  const { data: inv, error: invErr } = await supabaseAdmin.from('sales_invoices').insert({
    invoice_number: pf.invoice_number,
    invoice_type: docType === 'service_invoice' ? 'service' : 'final',
    commercial_order_id: order?.id ?? null,
    source_proforma_id: proformaId,
    source_issued_document_id: issuedDocumentId,
    source_revision: pf.revision_number ?? null,
    client_id: pf.contact_user_id ?? null,
    project_id: order?.project_id ?? null,
    currency: pf.currency ?? 'GBP',
    status: 'issued',
    issue_date: pf.invoice_date ?? now.slice(0, 10),
    due_date: pf.invoice_due_date ?? null,
    client_snapshot: { name: pf.client_name, email: pf.client_email, company: pf.client_company, project: pf.project_name },
    subtotal: netSubtotal,
    tax_total: vatTotal,
    gross_total: grossTotal,
    amount_paid: 0,
    credit_total: 0,
    balance_due: grossTotal,
    issued_by: actor.id,
    issued_at: now,
    locked_at: now,
  }).select('id, invoice_number').single()
  if (invErr || !inv) return { error: `Could not create the invoice ledger record: ${invErr?.message ?? 'insert failed'}`, status: 500 }

  // Client-facing line snapshots (selling prices only — no supplier
  // cost, markup or margin ever enters an invoice line).
  const { data: lines } = await supabaseAdmin
    .from('proforma_line_items')
    .select('id, line_type, product_id, service_catalogue_id, name, description, spec_details, quantity, unit_of_measure, selling_price_unit, unit_price, tax_category, line_net_total, line_tax_total, line_gross_total, sort_order')
    .eq('proforma_id', proformaId).order('sort_order')
  if (lines && lines.length) {
    await supabaseAdmin.from('sales_invoice_lines').insert(lines.map((l, i) => ({
      sales_invoice_id: inv.id,
      source_line_item_id: l.id,
      line_type: l.line_type ?? 'product',
      product_id: l.product_id ?? null,
      service_catalogue_id: l.service_catalogue_id ?? null,
      name_snapshot: l.name ?? 'Item',
      description_snapshot: l.description ?? null,
      specification_snapshot: l.spec_details ?? null,
      quantity: Number(l.quantity ?? 1) > 0 ? Number(l.quantity ?? 1) : 1,
      unit_of_measure: l.unit_of_measure ?? 'each',
      unit_price: Number(l.selling_price_unit ?? l.unit_price ?? 0),
      tax_category: l.tax_category ?? 'standard',
      line_net_total: Number(l.line_net_total ?? 0),
      line_tax_total: Number(l.line_tax_total ?? 0),
      line_gross_total: Number(l.line_gross_total ?? 0),
      sort_order: l.sort_order ?? i,
    })))
  }

  await logAudit({
    actor, action: 'commercial.invoice_issued', entityType: 'sales_invoice', entityId: inv.id,
    after: { invoiceNumber: inv.invoice_number, mirroredFromProforma: proformaId, issuedDocumentId },
  })
  return { data: { invoiceId: inv.id, invoiceNumber: inv.invoice_number, alreadyExisted: false } }
}
