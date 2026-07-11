import 'server-only'
import { supabaseAdmin } from '../supabase'
import type { SessionUser } from '../types'
import type { CommercialSettings, ApprovalThresholds } from './types'
import { DEFAULT_APPROVAL_THRESHOLDS } from './types'

// ============================================================
// Protected commercial settings access.
//
// - Single-row table (guarded by a unique singleton column).
// - Bank / VAT / legal-identity fields are sensitive: they are
//   masked for viewers, editable by Ultra Admin only, and never
//   flow through the generic site-settings route.
// ============================================================

export const SENSITIVE_FIELDS = [
  'bank_name', 'bank_account_name', 'bank_account_number', 'bank_sort_code',
] as const

export const IDENTITY_FIELDS = [
  'company_legal_name', 'company_registration_number', 'registered_address',
  'vat_registered', 'vat_number', 'invoice_email', 'invoice_phone',
] as const

export const COMMERCIAL_RULE_FIELDS = [
  'pricing_method_default', 'default_vat_rate', 'default_tax_category',
  'default_deposit_percent', 'deposit_value_rules', 'default_quote_expiry_days',
  'default_currency', 'default_payment_terms', 'default_lead_time',
  'procurement_fee_type', 'procurement_fee_basis', 'procurement_fee_value',
  'procurement_fee_tiers', 'approval_thresholds',
] as const

export async function getCommercialSettings(): Promise<CommercialSettings> {
  const { data, error } = await supabaseAdmin
    .from('commercial_settings')
    .select('*')
    .limit(1)
    .single()
  if (error || !data) {
    throw new Error('Commercial settings are not initialised. Run the commercial_foundation migration.')
  }
  const row = data as CommercialSettings
  // Merge stored thresholds over defaults so missing keys never break checks.
  row.approval_thresholds = {
    ...DEFAULT_APPROVAL_THRESHOLDS,
    ...(row.approval_thresholds as Partial<ApprovalThresholds> | null ?? {}),
  }
  return row
}

/** Mask a bank value for display/audit: keep the last 2 characters. */
export function maskSensitive(value: string | null): string | null {
  if (!value) return value
  if (value.length <= 2) return '••'
  return '•'.repeat(Math.max(value.length - 2, 2)) + value.slice(-2)
}

/** Settings shaped for a viewer without full banking rights. */
export function maskSettingsForViewer(settings: CommercialSettings): CommercialSettings {
  return {
    ...settings,
    bank_account_number: maskSensitive(settings.bank_account_number),
    bank_sort_code: maskSensitive(settings.bank_sort_code),
  }
}

/** Append an immutable change-log entry. Bank values are stored masked. */
export async function logSettingChange(params: {
  actor: SessionUser
  settingGroup: string
  changedFields: string[]
  before: Record<string, unknown>
  after: Record<string, unknown>
  reason: string | null
  requestMetadata?: Record<string, unknown>
}): Promise<void> {
  const maskGroup = (obj: Record<string, unknown>) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      out[k] = (SENSITIVE_FIELDS as readonly string[]).includes(k) && typeof v === 'string'
        ? maskSensitive(v)
        : v
    }
    return out
  }
  const { error } = await supabaseAdmin.from('commercial_setting_changes').insert({
    setting_group: params.settingGroup,
    changed_fields: params.changedFields,
    before_value: maskGroup(params.before),
    after_value: maskGroup(params.after),
    reason: params.reason,
    actor_user_id: params.actor.id,
    actor_email_snapshot: params.actor.email,
    request_metadata: params.requestMetadata ?? null,
  })
  if (error) console.error('[commercial] setting change log failed:', error.message)
}
