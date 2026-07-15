import 'server-only'
import { getSession } from '../auth'
import { supabaseAdmin } from '../supabase'
import type { SessionUser } from '../types'
import type { CommercialPermission } from './types'

// ============================================================
// Granular commercial permissions.
//
// Resolution rules:
//  • users.is_ultra_admin = true  → every permission incl. 'ultra_admin'.
//    Ultra Admin status lives in the DB (never in the JWT) so it is
//    checked live on every request and cannot be minted client-side.
//  • role 'admin'                 → all commercial permissions EXCEPT
//    'ultra_admin' (ordinary admins cannot self-serve protected settings).
//  • role 'staff'                 → staff_permissions array, with a
//    backward-compatibility mapping for the legacy 'quote_pipeline' key.
// ============================================================

export interface CommercialSession {
  user: SessionUser
  isUltraAdmin: boolean
  permissions: Set<string>
}

const ADMIN_IMPLIED: CommercialPermission[] = [
  'quote_pipeline_view', 'quote_create', 'quote_edit', 'quote_price_edit',
  'quote_discount_override', 'quote_approve', 'commercial_settings_view',
  'invoice_view', 'invoice_create', 'invoice_issue', 'payment_view',
  'payment_record', 'payment_allocate', 'credit_note_create', 'purchase_order_prepare',
  // Sprint 4 — delivery & logistics (operational, not finance-segregated)
  'delivery_view', 'delivery_create', 'delivery_dispatch', 'delivery_confirm',
  'pod_record', 'installation_manage',
  // Sprint 5 — documents & prepared communications (operational)
  'document_generate', 'document_verify', 'communication_prepare',
  'communication_mark_sent',
  // Sprint 6 — accounting controls (operational). 'invoice_void' is
  // admin-implied but SQL hard-blocks it once the period is locked.
  'accounting_view', 'accounting_export', 'reconciliation_manage',
  'refund_record', 'invoice_void',
]

// Segregated finance controls — Ultra Admin by default, explicitly grantable
// to staff. Ordinary admins do NOT self-serve approval/confirmation/reversal.
// 'template_manage' is Ultra-by-default too — templates are brand voice.
const ULTRA_FINANCE_IMPLIED: CommercialPermission[] = [
  'invoice_approve', 'payment_confirm', 'payment_reverse', 'credit_note_approve',
  'template_manage',
  // Sprint 6 — segregated accounting controls
  'refund_approve', 'period_manage',
]

/** Legacy broad permission → granular working permissions. */
const LEGACY_MAP: Record<string, CommercialPermission[]> = {
  quote_pipeline: ['quote_pipeline_view', 'quote_create', 'quote_edit'],
}

export async function getCommercialSession(): Promise<CommercialSession | null> {
  const session = await getSession()
  if (!session) return null
  if (session.role !== 'admin' && session.role !== 'staff') return null

  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('is_ultra_admin, status')
    .eq('id', session.id)
    .single()
  // Live status check: archived AND deleted accounts lose commercial
  // access immediately, even if a session cookie is still valid.
  if (!userRow || userRow.status === 'archived' || userRow.status === 'deleted') return null

  const isUltraAdmin = Boolean(userRow.is_ultra_admin)
  const permissions = new Set<string>()

  if (isUltraAdmin) {
    permissions.add('ultra_admin')
    permissions.add('commercial_settings_manage')
    permissions.add('purchase_order_approve')
    for (const p of ADMIN_IMPLIED) permissions.add(p)
    for (const p of ULTRA_FINANCE_IMPLIED) permissions.add(p)
  } else if (session.role === 'admin') {
    for (const p of ADMIN_IMPLIED) permissions.add(p)
  } else {
    const { data } = await supabaseAdmin
      .from('staff_permissions')
      .select('permissions')
      .eq('user_id', session.id)
      .single()
    const raw = (data?.permissions ?? []) as string[]
    for (const p of raw) {
      // Staff can never carry ultra_admin or settings-manage via the
      // permissions array; those flow only from is_ultra_admin.
      if (p === 'ultra_admin' || p === 'commercial_settings_manage') continue
      permissions.add(p)
      for (const mapped of LEGACY_MAP[p] ?? []) permissions.add(mapped)
    }
  }

  return { user: session, isUltraAdmin, permissions }
}

/** Fetch the session and require one (or all of several) permission(s). */
export async function requireCommercial(
  required: CommercialPermission | CommercialPermission[],
): Promise<CommercialSession | null> {
  const cs = await getCommercialSession()
  if (!cs) return null
  const list = Array.isArray(required) ? required : [required]
  for (const p of list) {
    if (!cs.permissions.has(p)) return null
  }
  return cs
}

export function hasPermission(cs: CommercialSession, p: CommercialPermission): boolean {
  return cs.permissions.has(p)
}

/** Fetch the session and require ANY ONE of several permissions. */
export async function requireAnyCommercial(
  required: CommercialPermission[],
): Promise<CommercialSession | null> {
  const cs = await getCommercialSession()
  if (!cs) return null
  return required.some(p => cs.permissions.has(p)) ? cs : null
}
