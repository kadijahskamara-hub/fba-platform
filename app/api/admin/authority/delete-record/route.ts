import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCommercialSession } from '@/lib/commercial/permissions'
import { validateRecordDeletion } from '@/lib/commercial/authorityLogic'
import { logAudit } from '@/lib/audit'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { vString, vUuid, ValidationError } from '@/lib/commercial/validation'

// ============================================================
// POST /api/admin/authority/delete-record  (Sprint 7.1)
// Permanently delete ONE commercial record (quote/proforma,
// order, invoice, payment, credit note, refund, delivery, PO,
// retail order, quote request) together with its dependents.
// Ultra Admin ONLY — never grantable. Atomic + audited inside
// delete_commercial_record() (SECURITY DEFINER, service_role
// only). Non-Ultra attempts are audited as security events.
// ============================================================

export async function POST(req: NextRequest) {
  const cs = await getCommercialSession()
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const ip = getClientIp(req)

  if (!cs.isUltraAdmin) {
    await logAudit({
      actor: cs.user,
      action: 'security.record_delete_denied',
      entityType: 'platform',
      after: { ip, route: '/api/admin/authority/delete-record' },
    })
    return NextResponse.json({ success: false, error: 'Deleting commercial records is an Ultra Admin power.' }, { status: 403 })
  }

  const rl = checkRateLimit(`record-delete:${cs.user.id}:${ip}`, 20, 15 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'Too many deletions. Try again later.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  let entity: string
  let id: string
  let reason: string
  try {
    entity = vString(body.entity, 'entity', { max: 40, required: true }) ?? ''
    id = vUuid(body.id, 'id')
    reason = vString(body.reason, 'reason', { max: 500, required: true }) ?? ''
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    }
    throw e
  }

  const check = validateRecordDeletion({ entity, reason })
  if (!check.allowed) {
    return NextResponse.json({ success: false, error: check.message, code: check.code }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.rpc('delete_commercial_record', {
    p_actor: cs.user.id, p_entity: entity, p_id: id, p_reason: reason.trim(),
  })
  if (error) {
    const code = error.message.split(':')[0]?.trim()
    const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : 400
    return NextResponse.json({ success: false, error: error.message, code }, { status })
  }

  return NextResponse.json({ success: true, data })
}
