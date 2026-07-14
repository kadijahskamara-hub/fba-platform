import 'server-only'
import { supabaseAdmin } from '../supabase'
import { logAudit } from '../audit'
import { DATE_RE } from './validation'
import type { SessionUser } from '../types'

// ============================================================
// Accounting periods (Sprint 6). Ultra Admin closes/reopens a
// period; once closed, every financial document with a tax point
// inside it is frozen (enforced by SQL fns + the guard trigger).
// ============================================================

interface DomainErr { error: string; status: number }
export type DomainResult<T> = { data: T } | DomainErr
export function isErr<T>(r: DomainResult<T>): r is DomainErr { return (r as DomainErr).error !== undefined }

export interface AccountingPeriod {
  id: string; label: string; starts_on: string; ends_on: string; status: 'open' | 'closed'
  closed_by: string | null; closed_at: string | null
  reopened_by: string | null; reopened_at: string | null; reopen_reason: string | null
  created_at: string
}

export async function listPeriods(): Promise<AccountingPeriod[]> {
  const { data } = await supabaseAdmin.from('accounting_periods').select('*').order('starts_on', { ascending: false })
  return (data ?? []) as AccountingPeriod[]
}

export async function createPeriod(params: {
  label: string; startsOn: string; endsOn: string; actor: SessionUser
}): Promise<DomainResult<{ period: AccountingPeriod }>> {
  const label = String(params.label ?? '').trim()
  if (!label) return { error: 'A period label is required (e.g. 2026-Q3).', status: 400 }
  if (!DATE_RE.test(params.startsOn) || !DATE_RE.test(params.endsOn)) return { error: 'Start and end must be valid dates.', status: 400 }
  if (params.endsOn < params.startsOn) return { error: 'End date must be on or after the start date.', status: 400 }

  const { data, error } = await supabaseAdmin.from('accounting_periods').insert({
    label, starts_on: params.startsOn, ends_on: params.endsOn, status: 'open', created_by: params.actor.id,
  }).select().single()
  if (error) {
    if (/no_period_overlap/.test(error.message)) return { error: 'This period overlaps an existing one.', status: 409 }
    if (/unique/.test(error.message)) return { error: 'A period with that label already exists.', status: 409 }
    return { error: error.message, status: 500 }
  }
  await logAudit({ actor: params.actor, action: 'commercial.period_created', entityType: 'accounting_period', entityId: data.id, after: { label } })
  return { data: { period: data as AccountingPeriod } }
}

export async function closePeriod(id: string, actor: SessionUser): Promise<DomainResult<{ label: string }>> {
  const { data, error } = await supabaseAdmin.rpc('close_accounting_period', { p_period: id, p_actor: actor.id })
  if (error) return { error: error.message, status: 500 }
  const res = data as { ok: boolean; error?: string; label?: string }
  if (!res?.ok) return { error: res?.error === 'already_closed' ? 'Period is already closed.' : (res?.error ?? 'Close failed'), status: 409 }
  await logAudit({ actor, action: 'commercial.period_closed', entityType: 'accounting_period', entityId: id, after: { label: res.label } })
  return { data: { label: res.label! } }
}

export async function reopenPeriod(id: string, actor: SessionUser, reason: string): Promise<DomainResult<{ label: string }>> {
  if (!String(reason ?? '').trim()) return { error: 'A reason is required to reopen a closed period.', status: 400 }
  const { data, error } = await supabaseAdmin.rpc('reopen_accounting_period', { p_period: id, p_actor: actor.id, p_reason: reason })
  if (error) return { error: error.message, status: 500 }
  const res = data as { ok: boolean; error?: string; label?: string }
  if (!res?.ok) return { error: res?.error === 'not_closed' ? 'Period is not closed.' : (res?.error ?? 'Reopen failed'), status: 409 }
  await logAudit({ actor, action: 'commercial.period_reopened', entityType: 'accounting_period', entityId: id, before: { status: 'closed' }, after: { status: 'open', reason } })
  return { data: { label: res.label! } }
}
