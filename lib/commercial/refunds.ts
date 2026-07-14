import 'server-only'
import { supabaseAdmin } from '../supabase'
import { logAudit } from '../audit'
import type { SessionUser } from '../types'

// ============================================================
// Refunds (Sprint 6) — against a confirmed payment OR an unallocated
// credit-note balance. record → approve (segregation of duties) →
// complete. All state changes go through atomic SECURITY DEFINER
// fns; period locks are enforced in SQL (record/complete inserts are
// blocked when dated into a closed period).
// ============================================================

interface DomainErr { error: string; status: number }
export type DomainResult<T> = { data: T } | DomainErr
export function isErr<T>(r: DomainResult<T>): r is DomainErr { return (r as DomainErr).error !== undefined }

const RECORD_ERRORS: Record<string, string> = {
  one_source_required: 'A refund must be against exactly one source (a payment or a credit note).',
  bad_amount: 'Refund amount must be greater than zero.',
  payment_not_found: 'Payment not found.',
  payment_not_confirmed: 'Only confirmed payments can be refunded.',
  credit_note_not_found: 'Credit note not found.',
  credit_note_not_issued: 'Only an issued credit note can be refunded.',
  exceeds_available: 'The refund exceeds the amount available on this source.',
}

/** Remaining refundable amount on a payment (amount − non-cancelled refunds). */
export async function refundableForPayment(paymentId: string): Promise<number> {
  const { data: pay } = await supabaseAdmin.from('payments').select('amount, status').eq('id', paymentId).single()
  if (!pay || pay.status !== 'confirmed') return 0
  const { data: rfds } = await supabaseAdmin.from('refunds').select('amount').eq('payment_id', paymentId).neq('status', 'cancelled')
  const used = (rfds ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
  return Math.max(0, Number(pay.amount ?? 0) - used)
}

/** Remaining refundable on a credit note (gross − allocated − non-cancelled refunds). */
export async function refundableForCreditNote(creditNoteId: string): Promise<number> {
  const { data: cn } = await supabaseAdmin.from('credit_notes').select('gross_total, allocated_total, status').eq('id', creditNoteId).single()
  if (!cn || !['issued', 'allocated'].includes(cn.status)) return 0
  const { data: rfds } = await supabaseAdmin.from('refunds').select('amount').eq('credit_note_id', creditNoteId).neq('status', 'cancelled')
  const used = (rfds ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
  return Math.max(0, Number(cn.gross_total ?? 0) - Number(cn.allocated_total ?? 0) - used)
}

export async function recordRefund(params: {
  paymentId?: string | null
  creditNoteId?: string | null
  amount: number
  refundDate?: string | null
  method?: string
  externalReference?: string | null
  reason?: string | null
  actor: SessionUser
}): Promise<DomainResult<{ refundNumber: string }>> {
  const { data, error } = await supabaseAdmin.rpc('record_refund', {
    p_payment: params.paymentId ?? null,
    p_credit_note: params.creditNoteId ?? null,
    p_amount: params.amount,
    p_date: params.refundDate ?? null,
    p_method: params.method ?? 'bank_transfer',
    p_reference: params.externalReference ?? null,
    p_reason: params.reason ?? null,
    p_actor: params.actor.id,
  })
  if (error) {
    const msg = /closed accounting period/i.test(error.message)
      ? 'This refund date falls in a closed accounting period.' : `Refund failed: ${error.message}`
    return { error: msg, status: 409 }
  }
  const res = data as { ok: boolean; error?: string; refund_number?: string; available?: number }
  if (!res?.ok) {
    let m = RECORD_ERRORS[res?.error ?? ''] ?? res?.error ?? 'Refund failed'
    if (res?.error === 'exceeds_available' && res.available != null) m += ` (available ${res.available}).`
    return { error: m, status: 409 }
  }
  await logAudit({
    actor: params.actor, action: 'commercial.refund_recorded', entityType: 'refund', entityId: res.refund_number!,
    after: { paymentId: params.paymentId, creditNoteId: params.creditNoteId, amount: params.amount },
  })
  return { data: { refundNumber: res.refund_number! } }
}

export async function approveRefund(id: string, actor: SessionUser): Promise<DomainResult<{ approved: true }>> {
  const { data, error } = await supabaseAdmin.rpc('approve_refund', { p_refund: id, p_actor: actor.id })
  if (error) return { error: `Approval failed: ${error.message}`, status: 500 }
  const res = data as { ok: boolean; error?: string }
  if (!res?.ok) {
    const m = res?.error === 'segregation' ? 'Segregation of duties: you cannot approve a refund you recorded.'
      : res?.error === 'not_pending' ? 'Only a pending refund can be approved.' : (res?.error ?? 'Approval failed')
    return { error: m, status: res?.error === 'segregation' ? 403 : 409 }
  }
  await logAudit({ actor, action: 'commercial.refund_approved', entityType: 'refund', entityId: id })
  return { data: { approved: true } }
}

export async function completeRefund(id: string, actor: SessionUser): Promise<DomainResult<{ completed: true }>> {
  const { data, error } = await supabaseAdmin.rpc('complete_refund', { p_refund: id, p_actor: actor.id })
  if (error) return { error: `Completion failed: ${error.message}`, status: 500 }
  const res = data as { ok: boolean; error?: string }
  if (!res?.ok) return { error: res?.error === 'not_approved' ? 'Only an approved refund can be completed.' : (res?.error ?? 'Completion failed'), status: 409 }
  await logAudit({ actor, action: 'commercial.refund_completed', entityType: 'refund', entityId: id })
  return { data: { completed: true } }
}

export async function cancelRefund(id: string, actor: SessionUser, reason: string): Promise<DomainResult<{ cancelled: true }>> {
  const { data: r } = await supabaseAdmin.from('refunds').select('status').eq('id', id).single()
  if (!r) return { error: 'Refund not found', status: 404 }
  if (!['pending', 'approved'].includes(r.status)) return { error: 'Only a pending or approved refund can be cancelled.', status: 409 }
  const { error } = await supabaseAdmin.from('refunds').update({
    status: 'cancelled', cancelled_reason: reason, updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return { error: error.message, status: 500 }
  await logAudit({ actor, action: 'commercial.refund_cancelled', entityType: 'refund', entityId: id, after: { reason } })
  return { data: { cancelled: true } }
}
