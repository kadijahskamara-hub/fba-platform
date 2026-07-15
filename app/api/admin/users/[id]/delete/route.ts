import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCommercialSession } from '@/lib/commercial/permissions'
import {
  canDeleteAccount, validateDeleteConfirmation, type AuthorityAccount,
} from '@/lib/commercial/authorityLogic'
import { logAudit } from '@/lib/audit'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { ValidationError, vString, vUuid } from '@/lib/commercial/validation'

// ============================================================
// POST /api/admin/users/[id]/delete  (Sprint 7 Part B)
//
// PERMANENT account deletion — Ultra Admin ONLY (not grantable
// to ordinary admins or staff). Works on any account type:
// admin, staff, trade, client/retail.
//
// Body: { reason: string, confirmEmail: string }
//   confirmEmail must exactly match the target account's email
//   (the typed-confirmation dialog re-checked server-side).
//
// Semantics (atomic, inside delete_user_account(), service_role
// only): personal/operational child rows are hard-deleted;
// the user row is anonymised (PII stripped, credentials revoked,
// status='deleted'); financial + audit history survives pointing
// at the anonymised row. Refuses self-deletion, deleting the
// last active Ultra Admin, and empty reasons. Fully audited.
//
// Attempts by non-Ultra actors return 403 and are audited as
// security events.
// ============================================================

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const params = await ctx.params
  const cs = await getCommercialSession()
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const ip = getClientIp(req)

  if (!cs.isUltraAdmin) {
    await logAudit({
      actor: cs.user,
      action: 'security.account_delete_denied',
      entityType: 'user',
      entityId: params.id,
      after: { ip, route: '/api/admin/users/[id]/delete' },
    })
    return NextResponse.json({ success: false, error: 'Account deletion is an Ultra Admin power.' }, { status: 403 })
  }

  const rl = checkRateLimit(`account-delete:${cs.user.id}:${ip}`, 5, 15 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'Too many deletion attempts. Try again later.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  let targetId: string
  let reason: string
  let confirmEmail: string
  try {
    targetId = vUuid(params.id, 'id')
    reason = vString(body.reason, 'reason', { max: 500, required: true }) ?? ''
    confirmEmail = vString(body.confirmEmail, 'confirmEmail', { max: 320, required: true }) ?? ''
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    }
    throw e
  }

  // Load actor + target + active Ultra count for the pure pre-checks.
  const [{ data: actorRow }, { data: targetRow }, { count: ultras }] = await Promise.all([
    supabaseAdmin.from('users').select('id, email, role, status, is_ultra_admin').eq('id', cs.user.id).single(),
    supabaseAdmin.from('users').select('id, email, role, status, is_ultra_admin').eq('id', targetId).single(),
    supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('is_ultra_admin', true).eq('status', 'active'),
  ])

  const toAccount = (r: typeof actorRow): AuthorityAccount | null => r ? {
    id: r.id, email: r.email, role: r.role, status: r.status, isUltraAdmin: Boolean(r.is_ultra_admin),
  } : null

  const target = toAccount(targetRow)
  if (!target) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }

  // Typed confirmation — the email must be retyped exactly.
  const confirm = validateDeleteConfirmation({ confirmEmail, targetEmail: target.email, reason })
  if (!confirm.allowed) {
    return NextResponse.json({ success: false, error: confirm.message, code: confirm.code }, { status: 400 })
  }

  const decision = canDeleteAccount({
    actor: toAccount(actorRow), target, reason, activeUltraCount: ultras ?? 0,
  })
  if (!decision.allowed) {
    const status = decision.code === 'FORBIDDEN' ? 403 : decision.code === 'NOT_FOUND' ? 404 : 400
    return NextResponse.json({ success: false, error: decision.message, code: decision.code }, { status })
  }

  // Atomic deletion + anonymisation + audit inside the SQL function.
  const { data, error } = await supabaseAdmin.rpc('delete_user_account', {
    p_user_id: targetId, p_actor: cs.user.id, p_reason: reason.trim(),
  })
  if (error) {
    const code = error.message.split(':')[0]?.trim()
    const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : 400
    return NextResponse.json({ success: false, error: error.message, code }, { status })
  }

  return NextResponse.json({ success: true, data })
}
