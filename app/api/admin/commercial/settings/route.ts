import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import {
  getCommercialSettings, maskSettingsForViewer, logSettingChange,
  SENSITIVE_FIELDS, IDENTITY_FIELDS, COMMERCIAL_RULE_FIELDS,
} from '@/lib/commercial/settings'
import { logAudit } from '@/lib/audit'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import {
  ValidationError, vString, vNumber, vPercent, vEnum, vBoolean,
} from '@/lib/commercial/validation'
import { TAX_CATEGORIES } from '@/lib/commercial/types'

// ============================================================
// GET /api/admin/commercial/settings
//   View protected commercial settings.
//   Bank numbers are masked unless the caller is Ultra Admin.
//
// PUT /api/admin/commercial/settings
//   Grouped update. Group rules:
//     bank_details / vat_identity / company_identity:
//       Ultra Admin ONLY + password reauthentication + reason.
//     commercial rules (pricing, deposits, fees, expiry, thresholds):
//       commercial_settings_manage (Ultra Admin).
//   Every change is written to the immutable change log.
// ============================================================

export async function GET() {
  const cs = await requireCommercial('commercial_settings_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const settings = await getCommercialSettings()
  const data = cs.isUltraAdmin ? settings : maskSettingsForViewer(settings)
  return NextResponse.json({ success: true, data, canManage: cs.permissions.has('commercial_settings_manage'), isUltraAdmin: cs.isUltraAdmin })
}

const GROUPS: Record<string, readonly string[]> = {
  bank_details: SENSITIVE_FIELDS,
  company_identity: IDENTITY_FIELDS,
  commercial_rules: COMMERCIAL_RULE_FIELDS,
}
const REAUTH_GROUPS = new Set(['bank_details', 'company_identity'])

export async function PUT(req: NextRequest) {
  const cs = await requireCommercial('commercial_settings_manage')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const group = String(body.group ?? '')
  const fields = GROUPS[group]
  if (!fields) {
    return NextResponse.json({ success: false, error: 'Unknown settings group' }, { status: 400 })
  }

  // ── Sensitive groups: Ultra Admin + reauthentication + reason ──
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  if (REAUTH_GROUPS.has(group)) {
    if (!cs.isUltraAdmin) {
      return NextResponse.json({ success: false, error: 'Only Ultra Admin may change company, VAT, or bank details.' }, { status: 403 })
    }
    if (!reason) {
      return NextResponse.json({ success: false, error: 'A change reason is required for this settings group.' }, { status: 400 })
    }
    // A live session cookie is NOT sufficient — require the password again.
    const ip = getClientIp(req)
    const rl = checkRateLimit(`settings-reauth:${cs.user.id}:${ip}`, 5, 15 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many confirmation attempts. Try again later.' }, { status: 429 })
    }
    const password = typeof body.confirmPassword === 'string' ? body.confirmPassword : ''
    if (!password) {
      return NextResponse.json({ success: false, error: 'Password confirmation is required.', reauthRequired: true }, { status: 401 })
    }
    const { data: userRow } = await supabaseAdmin
      .from('users').select('password_hash').eq('id', cs.user.id).single()
    const ok = userRow && await bcrypt.compare(password, userRow.password_hash as string)
    if (!ok) {
      return NextResponse.json({ success: false, error: 'Password confirmation failed.', reauthRequired: true }, { status: 401 })
    }
  }

  // ── Validate the submitted fields ──
  const settings = await getCommercialSettings()
  const updates: Record<string, unknown> = {}
  try {
    for (const field of fields) {
      if (!(field in body)) continue
      const v = body[field]
      switch (field) {
        case 'pricing_method_default':
          updates[field] = vEnum(v, field, ['markup', 'margin'] as const, { required: true }); break
        case 'default_tax_category':
          updates[field] = vEnum(v, field, TAX_CATEGORIES, { required: true }); break
        case 'procurement_fee_type':
          updates[field] = vEnum(v, field, ['percentage', 'fixed', 'tiered', 'none'] as const, { required: true }); break
        case 'procurement_fee_basis':
          updates[field] = vEnum(v, field, ['product_selling_subtotal', 'product_cost_subtotal', 'approved_procurement_value', 'selected_lines', 'manual_base_amount'] as const, { required: true }); break
        case 'default_vat_rate':
        case 'default_deposit_percent':
          updates[field] = vPercent(v, field, true); break
        case 'default_quote_expiry_days':
          updates[field] = vNumber(v, field, { min: 1, max: 365, required: true }); break
        case 'procurement_fee_value':
          updates[field] = vNumber(v, field, { min: 0, required: true }); break
        case 'vat_registered':
          updates[field] = vBoolean(v, field, settings.vat_registered); break
        case 'deposit_value_rules':
        case 'procurement_fee_tiers': {
          if (!Array.isArray(v)) throw new ValidationError(`${field} must be an array`)
          updates[field] = v.slice(0, 20); break
        }
        case 'approval_thresholds': {
          if (typeof v !== 'object' || v === null) throw new ValidationError('approval_thresholds must be an object')
          const t = v as Record<string, unknown>
          updates[field] = {
            margin_commercial_below: vNumber(t.margin_commercial_below, 'margin_commercial_below', { min: 0, max: 100, required: true }),
            margin_ultra_below: vNumber(t.margin_ultra_below, 'margin_ultra_below', { min: 0, max: 100, required: true }),
            discount_commercial_above: vNumber(t.discount_commercial_above, 'discount_commercial_above', { min: 0, max: 100, required: true }),
            discount_ultra_above: vNumber(t.discount_ultra_above, 'discount_ultra_above', { min: 0, max: 100, required: true }),
            negative_margin: 'blocked_ultra_approval',
          }
          break
        }
        default:
          updates[field] = vString(v, field, { max: 2000 })
      }
    }
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    }
    throw e
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No valid fields submitted for this group.' }, { status: 400 })
  }

  const before: Record<string, unknown> = {}
  for (const k of Object.keys(updates)) before[k] = (settings as unknown as Record<string, unknown>)[k]

  const { error } = await supabaseAdmin
    .from('commercial_settings')
    .update({ ...updates, updated_at: new Date().toISOString(), updated_by: cs.user.id })
    .eq('id', settings.id)
  if (error) return NextResponse.json({ success: false, error: 'Settings update failed.' }, { status: 500 })

  await logSettingChange({
    actor: cs.user,
    settingGroup: group,
    changedFields: Object.keys(updates),
    before,
    after: updates,
    reason: reason || null,
    requestMetadata: { ip: getClientIp(req) },
  })
  const auditAction = group === 'bank_details'
    ? 'commercial.bank_details_changed'
    : group === 'company_identity'
      ? 'commercial.vat_details_changed'
      : 'commercial.settings_changed'
  await logAudit({
    actor: cs.user, action: auditAction, entityType: 'commercial_settings', entityId: settings.id,
    after: { group, fields: Object.keys(updates) }, // values intentionally omitted from the general audit list
  })

  return NextResponse.json({ success: true })
}
