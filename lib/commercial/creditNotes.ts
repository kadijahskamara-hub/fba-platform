import 'server-only'
import { supabaseAdmin } from '../supabase'
import { logAudit } from '../audit'
import { getCommercialSettings } from './settings'
import { calculateInvoice, checkCreditNoteAmount } from './invoiceCalculations'
import type { SessionUser } from '../types'
import type { TaxCategory } from './types'

// ============================================================
// Credit-note foundation (Sprint 3).
//
// A credit note references an issued invoice, cannot exceed the
// eligible invoice value, preserves tax treatment, requires
// approval, freezes an immutable snapshot at issue, and reduces the
// invoice balance only through allocation.
// ============================================================

interface DomainErr { error: string; status: number }
export type DomainResult<T> = { data: T } | DomainErr
export function isErr<T>(r: DomainResult<T>): r is DomainErr { return (r as DomainErr).error !== undefined }

/** Eligible = invoice gross − already-credited amount. */
async function eligibleCreditAmount(invoiceId: string): Promise<number> {
  const { data: inv } = await supabaseAdmin.from('sales_invoices').select('gross_total, credit_total').eq('id', invoiceId).single()
  if (!inv) return 0
  return Number(inv.gross_total ?? 0) - Number(inv.credit_total ?? 0)
}

export async function createDraftCreditNote(params: {
  invoiceId: string
  reason: string
  lines?: Array<{ name: string; quantity: number; unitPrice: number; taxCategory: TaxCategory; taxRate: number | null }>
  amount?: number | null   // simple single-line adjustment if lines not given
  actor: SessionUser
}): Promise<DomainResult<{ creditNote: Record<string, unknown> }>> {
  const { data: inv } = await supabaseAdmin.from('sales_invoices').select('*').eq('id', params.invoiceId).single()
  if (!inv) return { error: 'Invoice not found', status: 404 }
  if (!inv.locked_at) return { error: 'Credit notes can only reference an issued invoice.', status: 409 }
  if (!params.reason) return { error: 'A reason is required for a credit note.', status: 400 }

  const settings = await getCommercialSettings()
  const vatRegistered = Boolean(settings.vat_registered)
  const standardRate = Number(settings.default_vat_rate ?? 20)

  const lineInputs = params.lines && params.lines.length > 0
    ? params.lines.map(l => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountAmount: 0, taxCategory: l.taxCategory, taxRate: l.taxRate }))
    : [{
        quantity: 1, unitPrice: vatRegistered ? Number(params.amount ?? 0) / (1 + standardRate / 100) : Number(params.amount ?? 0),
        discountAmount: 0, taxCategory: (vatRegistered ? 'standard' : 'zero') as TaxCategory, taxRate: vatRegistered ? standardRate : 0,
      }]

  const calc = calculateInvoice({ vatRegistered, lines: lineInputs })

  const eligible = await eligibleCreditAmount(params.invoiceId)
  const guard = checkCreditNoteAmount({ creditNoteGross: calc.grossTotal, eligibleInvoiceAmount: eligible })
  if (!guard.ok) return { error: guard.error!, status: 409 }

  const { data: cn, error } = await supabaseAdmin.from('credit_notes').insert({
    sales_invoice_id: params.invoiceId, client_id: inv.client_id ?? null, currency: inv.currency,
    status: 'draft', reason: params.reason,
    subtotal: calc.subtotal, tax_total: calc.taxTotal, gross_total: calc.grossTotal,
    approval_status: 'required', created_by: params.actor.id,
  }).select().single()
  if (error || !cn) return { error: 'Credit note creation failed.', status: 500 }

  let sort = 0
  for (let i = 0; i < calc.lines.length; i++) {
    const lr = calc.lines[i]
    await supabaseAdmin.from('credit_note_lines').insert({
      credit_note_id: cn.id, name_snapshot: params.lines?.[i]?.name ?? params.reason,
      quantity: lr.quantity, unit_price: lr.unitPrice, discount_amount: lr.discountAmount,
      tax_category: lr.taxCategory, tax_rate_snapshot: lr.taxRate,
      line_net_total: lr.lineNetTotal, line_tax_total: lr.lineTaxTotal, line_gross_total: lr.lineGrossTotal,
      sort_order: sort++,
    })
  }
  await logAudit({
    actor: params.actor, action: 'commercial.credit_note_created', entityType: 'credit_note', entityId: cn.id,
    after: { invoiceId: params.invoiceId, gross: calc.grossTotal },
  })
  return { data: { creditNote: cn } }
}

export async function approveCreditNote(id: string, actor: SessionUser): Promise<DomainResult<{ approved: true }>> {
  const { data: cn } = await supabaseAdmin.from('credit_notes').select('*').eq('id', id).single()
  if (!cn) return { error: 'Credit note not found', status: 404 }
  if (cn.locked_at) return { error: 'Credit note is already issued.', status: 409 }
  if (cn.created_by === actor.id) return { error: 'Segregation of duties: you cannot approve a credit note you created.', status: 403 }
  await supabaseAdmin.from('credit_notes').update({
    status: 'approved', approval_status: 'approved', approved_by: actor.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', id)
  await logAudit({ actor, action: 'commercial.credit_note_approved', entityType: 'credit_note', entityId: id })
  return { data: { approved: true } }
}

export async function issueCreditNote(id: string, actor: SessionUser): Promise<DomainResult<{ creditNoteNumber: string }>> {
  const { data: cn } = await supabaseAdmin.from('credit_notes').select('*').eq('id', id).single()
  if (!cn) return { error: 'Credit note not found', status: 404 }
  const settings = await getCommercialSettings()
  const { data: lines } = await supabaseAdmin.from('credit_note_lines').select('*').eq('credit_note_id', id).order('sort_order')
  const snapshot = {
    sales_invoice_id: cn.sales_invoice_id, reason: cn.reason, currency: cn.currency,
    company: { legal_name: settings.company_legal_name, vat_number: settings.vat_number, address: settings.registered_address },
    lines: (lines ?? []).map(l => ({
      name: l.name_snapshot, quantity: Number(l.quantity), unit_price: Number(l.unit_price),
      tax_category: l.tax_category, tax_rate: Number(l.tax_rate_snapshot ?? 0),
      line_net_total: Number(l.line_net_total), line_tax_total: Number(l.line_tax_total), line_gross_total: Number(l.line_gross_total),
    })),
    totals: { subtotal: Number(cn.subtotal), tax_total: Number(cn.tax_total), gross_total: Number(cn.gross_total) },
    issued_at: new Date().toISOString(), issued_by: actor.email,
  }
  const { data, error } = await supabaseAdmin.rpc('issue_credit_note', { p_credit_note_id: id, p_snapshot: snapshot, p_actor: actor.id })
  if (error) return { error: `Issue failed: ${error.message}`, status: 500 }
  const res = data as { ok: boolean; error?: string; credit_note_number?: string }
  if (!res?.ok) return { error: res?.error === 'approval_required' ? 'The credit note must be approved before issue.' : (res?.error ?? 'Issue failed'), status: 409 }
  await logAudit({ actor, action: 'commercial.credit_note_issued', entityType: 'credit_note', entityId: id, after: { creditNoteNumber: res.credit_note_number } })
  return { data: { creditNoteNumber: res.credit_note_number! } }
}

export async function allocateCreditNote(params: {
  creditNoteId: string; invoiceId: string; amount: number; actor: SessionUser
}): Promise<DomainResult<{ allocated: number }>> {
  const { data, error } = await supabaseAdmin.rpc('allocate_credit_note', {
    p_credit_note_id: params.creditNoteId, p_invoice_id: params.invoiceId, p_amount: params.amount, p_actor: params.actor.id,
  })
  if (error) return { error: `Allocation failed: ${error.message}`, status: 500 }
  const res = data as { ok: boolean; error?: string; allocated?: number; available?: number }
  if (!res?.ok) return { error: res?.error ?? 'Allocation failed', status: 409 }
  await logAudit({
    actor: params.actor, action: 'commercial.credit_note_allocated', entityType: 'credit_note', entityId: params.creditNoteId,
    after: { invoiceId: params.invoiceId, amount: res.allocated },
  })
  return { data: { allocated: res.allocated! } }
}
