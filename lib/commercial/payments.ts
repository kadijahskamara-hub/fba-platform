import 'server-only'
import { randomBytes } from 'crypto'
import { supabaseAdmin } from '../supabase'
import { logAudit } from '../audit'
import { getCommercialSettings } from './settings'
import type { SessionUser } from '../types'

// ============================================================
// Payment ledger orchestration (Sprint 3).
//
// Payments are ledger records; invoice amount_paid / balance_due
// are DERIVED from confirmed allocations (never edited directly).
// Allocation and reversal use atomic SQL functions.
// ============================================================

interface DomainErr { error: string; status: number }
export type DomainResult<T> = { data: T } | DomainErr
export function isErr<T>(r: DomainResult<T>): r is DomainErr { return (r as DomainErr).error !== undefined }

function paymentReference(): string {
  const y = new Date().getFullYear()
  return `FBA-PAY-${y}-${randomBytes(4).toString('hex').toUpperCase()}`
}

export async function recordPayment(params: {
  clientId?: string | null
  commercialOrderId?: string | null
  amount: number
  currency: string
  paymentDate: string
  paymentMethod: string
  externalReference?: string | null
  bankReference?: string | null
  notes?: string | null
  actor: SessionUser
}): Promise<DomainResult<{ payment: Record<string, unknown> }>> {
  if (!(params.amount > 0)) return { error: 'Payment amount must be positive.', status: 400 }
  const { data: payment, error } = await supabaseAdmin.from('payments').insert({
    payment_reference: paymentReference(),
    client_id: params.clientId ?? null,
    commercial_order_id: params.commercialOrderId ?? null,
    currency: params.currency ?? 'GBP',
    amount: params.amount,
    payment_date: params.paymentDate,
    payment_method: params.paymentMethod,
    external_reference: params.externalReference ?? null,
    bank_reference: params.bankReference ?? null,
    status: 'pending',
    notes: params.notes ?? null,
    recorded_by: params.actor.id,
  }).select().single()
  if (error || !payment) return { error: 'Could not record payment.', status: 500 }
  await logAudit({
    actor: params.actor, action: 'commercial.payment_recorded', entityType: 'payment', entityId: payment.id,
    after: { reference: payment.payment_reference, amount: params.amount, currency: params.currency },
  })
  return { data: { payment } }
}

/** Confirm a payment. Segregation: recorder cannot confirm their own unless Ultra Admin. */
export async function confirmPayment(params: {
  paymentId: string
  actor: SessionUser
  isUltraAdmin: boolean
  overrideBackdate?: boolean
}): Promise<DomainResult<{ confirmed: true }>> {
  const { data: pay } = await supabaseAdmin.from('payments').select('*').eq('id', params.paymentId).single()
  if (!pay) return { error: 'Payment not found', status: 404 }
  if (pay.status !== 'pending') return { error: `Payment is ${pay.status}; only pending payments can be confirmed.`, status: 409 }
  if (pay.recorded_by === params.actor.id && !params.isUltraAdmin) {
    return { error: 'Segregation of duties: you cannot confirm a payment you recorded. Another finance approver (or Ultra Admin) must confirm it.', status: 403 }
  }
  const settings = await getCommercialSettings()
  const threshold = Number(settings.payment_backdate_approval_days ?? 7)
  const ageDays = (Date.now() - new Date(pay.payment_date as string).getTime()) / 86400000
  if (ageDays > threshold && !params.isUltraAdmin && !params.overrideBackdate) {
    return { error: `This payment is backdated beyond ${threshold} days and requires Ultra Admin approval.`, status: 403 }
  }
  await supabaseAdmin.from('payments').update({
    status: 'confirmed', approved_by: params.actor.id, confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', params.paymentId)
  await logAudit({ actor: params.actor, action: 'commercial.payment_confirmed', entityType: 'payment', entityId: params.paymentId })
  return { data: { confirmed: true } }
}

export async function allocatePayment(params: {
  paymentId: string; invoiceId: string; amount: number; actor: SessionUser
}): Promise<DomainResult<{ allocated: number }>> {
  const { data, error } = await supabaseAdmin.rpc('allocate_payment', {
    p_payment_id: params.paymentId, p_invoice_id: params.invoiceId, p_amount: params.amount, p_actor: params.actor.id,
  })
  if (error) return { error: `Allocation failed: ${error.message}`, status: 500 }
  const res = data as { ok: boolean; error?: string; allocated?: number; available?: number }
  if (!res?.ok) return { error: allocationError(res?.error, res?.available), status: 409 }
  await logAudit({
    actor: params.actor, action: 'commercial.payment_allocated', entityType: 'payment', entityId: params.paymentId,
    after: { invoiceId: params.invoiceId, amount: res.allocated },
  })
  return { data: { allocated: res.allocated! } }
}

export async function removeAllocation(allocationId: string, actor: SessionUser): Promise<DomainResult<{ removed: true }>> {
  const { data: alloc } = await supabaseAdmin.from('payment_allocations').select('*').eq('id', allocationId).single()
  if (!alloc) return { error: 'Allocation not found', status: 404 }
  await supabaseAdmin.from('payment_allocations').delete().eq('id', allocationId)
  await supabaseAdmin.rpc('recompute_invoice_financials', { p_invoice_id: alloc.sales_invoice_id })
  await logAudit({
    actor, action: 'commercial.payment_unallocated', entityType: 'payment', entityId: alloc.payment_id as string,
    after: { invoiceId: alloc.sales_invoice_id, amount: alloc.amount },
  })
  return { data: { removed: true } }
}

export async function reversePayment(params: {
  paymentId: string; actor: SessionUser; reason: string
}): Promise<DomainResult<{ reversed: true }>> {
  const { data, error } = await supabaseAdmin.rpc('reverse_payment', {
    p_payment_id: params.paymentId, p_actor: params.actor.id, p_reason: params.reason,
  })
  if (error) return { error: `Reversal failed: ${error.message}`, status: 500 }
  const res = data as { ok: boolean; error?: string }
  if (!res?.ok) return { error: res?.error ?? 'Reversal failed', status: 409 }
  await logAudit({
    actor: params.actor, action: 'commercial.payment_reversed', entityType: 'payment', entityId: params.paymentId,
    after: { reason: params.reason },
  })
  return { data: { reversed: true } }
}

/** Issue a numbered, immutable receipt for a confirmed payment. */
export async function issueReceipt(paymentId: string, actor: SessionUser): Promise<DomainResult<{ receiptNumber: string }>> {
  const { data: pay } = await supabaseAdmin.from('payments').select('*').eq('id', paymentId).single()
  if (!pay) return { error: 'Payment not found', status: 404 }
  if (pay.status !== 'confirmed') return { error: 'Only confirmed payments can produce a receipt.', status: 409 }

  type ReceiptAlloc = { amount: number; invoice: { invoice_number: string } | null }
  const { data: allocsRaw } = await supabaseAdmin
    .from('payment_allocations')
    .select('amount, invoice:sales_invoices(invoice_number)')
    .eq('payment_id', paymentId)
  const allocs = (allocsRaw ?? []) as unknown as ReceiptAlloc[]
  const allocatedTotal = allocs.reduce((s, a) => s + Number(a.amount ?? 0), 0)

  const settings = await getCommercialSettings()
  const { data: numData, error: numErr } = await supabaseAdmin.rpc('next_receipt_number')
  if (numErr || !numData) return { error: 'Could not allocate a receipt number.', status: 500 }
  const receiptNumber = numData as string

  const snapshot = {
    receipt_number: receiptNumber,
    payment_reference: pay.payment_reference,
    amount: Number(pay.amount), currency: pay.currency,
    payment_date: pay.payment_date, payment_method: pay.payment_method,
    external_reference: pay.external_reference,
    allocations: allocs.map(a => ({
      invoice_number: a.invoice?.invoice_number ?? null, amount: Number(a.amount),
    })),
    unallocated_amount: Number(pay.amount) - allocatedTotal,
    company: { legal_name: settings.company_legal_name, vat_number: settings.vat_number, email: settings.invoice_email },
    issued_by: actor.email, issued_at: new Date().toISOString(),
  }
  const { error } = await supabaseAdmin.from('payment_receipts').insert({
    receipt_number: receiptNumber, payment_id: paymentId, snapshot, issued_by: actor.id,
  })
  if (error) return { error: 'Receipt creation failed.', status: 500 }
  await logAudit({ actor, action: 'commercial.receipt_issued', entityType: 'payment', entityId: paymentId, after: { receiptNumber } })
  return { data: { receiptNumber } }
}

function allocationError(code: string | undefined, available: number | undefined): string {
  switch (code) {
    case 'payment_not_confirmed': return 'The payment must be confirmed before it can be allocated.'
    case 'invoice_not_issued': return 'The invoice must be issued before payments can be allocated to it.'
    case 'currency_mismatch': return 'Payment and invoice currencies do not match.'
    case 'exceeds_payment_balance': return `Allocation exceeds the unallocated payment balance${available != null ? ` (${available} available)` : ''}.`
    case 'exceeds_invoice_balance': return `Allocation exceeds the invoice outstanding balance${available != null ? ` (${available} available)` : ''}.`
    default: return code ?? 'Allocation failed.'
  }
}
