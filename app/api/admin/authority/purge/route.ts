import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCommercialSession } from '@/lib/commercial/permissions'
import { validatePurgeRequest } from '@/lib/commercial/authorityLogic'
import { logAudit } from '@/lib/audit'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { vString, ValidationError } from '@/lib/commercial/validation'

// ============================================================
// POST /api/admin/authority/purge  (Sprint 7.1)
// PURGE ALL COMMERCIAL DATA — Ultra Admin only. Deletes every
// quote/proforma, order, PO, invoice, payment, credit note,
// refund, delivery, installation, document, communication,
// export run and accounting period, then restarts document
// numbering at 0001. Built for the pre-launch test-data reset.
//
// Requires the exact confirmation phrase + a reason. Atomic in
// delete-everything-or-nothing fashion via purge_commercial_data()
// (SECURITY DEFINER, service_role only). Fully audited; non-Ultra
// attempts are audited as security events.
// ============================================================

export async function POST(req: NextRequest) {
  const cs = await getCommercialSession()
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const ip = getClientIp(req)

  if (!cs.isUltraAdmin) {
    await logAudit({
      actor: cs.user,
      action: 'security.purge_denied',
      entityType: 'platform',
      after: { ip, route: '/api/admin/authority/purge' },
    })
    return NextResponse.json({ success: false, error: 'Purging commercial data is an Ultra Admin power.' }, { status: 403 })
  }

  const rl = checkRateLimit(`purge:${cs.user.id}:${ip}`, 3, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'Too many purge attempts. Try again later.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  let reason: string
  let confirmPhrase: string
  try {
    reason = vString(body.reason, 'reason', { max: 500, required: true }) ?? ''
    confirmPhrase = vString(body.confirmPhrase, 'confirmPhrase', { max: 100, required: true }) ?? ''
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    }
    throw e
  }

  const check = validatePurgeRequest({ confirmPhrase, reason })
  if (!check.allowed) {
    return NextResponse.json({ success: false, error: check.message, code: check.code }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.rpc('purge_commercial_data', {
    p_actor: cs.user.id, p_reason: reason.trim(),
  })
  if (error) {
    const code = error.message.split(':')[0]?.trim()
    return NextResponse.json({ success: false, error: error.message, code }, { status: code === 'FORBIDDEN' ? 403 : 400 })
  }

  return NextResponse.json({ success: true, data })
}
