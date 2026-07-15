import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCommercialSession } from '@/lib/commercial/permissions'
import { canSetUltraAdmin, type AuthorityAccount } from '@/lib/commercial/authorityLogic'
import { logAudit } from '@/lib/audit'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { ValidationError, vUuid, vBoolean } from '@/lib/commercial/validation'

// ============================================================
// Platform authority (Sprint 7 Part B) — Ultra Admin only.
//
// GET  /api/admin/authority
//   List admin accounts with their Ultra flag + the active Ultra
//   count (drives the Settings → Platform authority screen).
//
// POST /api/admin/authority
//   { targetId, grant } — grant or revoke Ultra Admin authority.
//   Rules enforced here for friendly errors AND atomically inside
//   set_ultra_admin() (SECURITY DEFINER, service_role only):
//     • only an active Ultra Admin may grant/revoke;
//     • Ultra authority is admin-role, active accounts only;
//     • no self-revoke;
//     • the platform must always retain ≥1 active Ultra Admin
//       (also guarded at the DB by trg_protect_last_ultra_admin).
//   Every change is audited by the SQL fn (actor, target,
//   before/after). Attempts by non-Ultra actors are audited as
//   security events.
// ============================================================

async function loadAccount(id: string): Promise<AuthorityAccount | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, email, role, status, is_ultra_admin')
    .eq('id', id)
    .single()
  if (!data) return null
  return {
    id: data.id, email: data.email, role: data.role,
    status: data.status, isUltraAdmin: Boolean(data.is_ultra_admin),
  }
}

async function activeUltraCount(): Promise<number> {
  const { count } = await supabaseAdmin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('is_ultra_admin', true)
    .eq('status', 'active')
  return count ?? 0
}

export async function GET() {
  const cs = await getCommercialSession()
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  if (!cs.isUltraAdmin) {
    return NextResponse.json({ success: false, error: 'Platform authority is restricted to Ultra Admins.' }, { status: 403 })
  }

  const [{ data: admins }, ultras] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, email, role, status, is_ultra_admin, created_at')
      .eq('role', 'admin')
      .neq('status', 'deleted')
      .order('created_at'),
    activeUltraCount(),
  ])

  return NextResponse.json({
    success: true,
    data: { admins: admins ?? [], activeUltraCount: ultras, selfId: cs.user.id },
  })
}

export async function POST(req: NextRequest) {
  const cs = await getCommercialSession()
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const ip = getClientIp(req)

  // Non-Ultra attempts are refused AND audited as security events.
  if (!cs.isUltraAdmin) {
    await logAudit({
      actor: cs.user,
      action: 'security.authority_change_denied',
      entityType: 'user',
      entityId: cs.user.id,
      after: { ip, route: '/api/admin/authority' },
    })
    return NextResponse.json({ success: false, error: 'Platform authority is restricted to Ultra Admins.' }, { status: 403 })
  }

  const rl = checkRateLimit(`authority:${cs.user.id}:${ip}`, 10, 15 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'Too many authority changes. Try again later.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  let targetId: string
  let grant: boolean
  try {
    targetId = vUuid(body.targetId, 'targetId')
    const g = vBoolean(body.grant, 'grant')
    if (g === null) throw new ValidationError('grant is required')
    grant = g
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    }
    throw e
  }

  // Friendly pre-check with the pure, unit-tested rules.
  const [actor, target, ultras] = await Promise.all([
    loadAccount(cs.user.id), loadAccount(targetId), activeUltraCount(),
  ])
  const decision = canSetUltraAdmin({ actor, target, grant, activeUltraCount: ultras })
  if (!decision.allowed) {
    const status = decision.code === 'FORBIDDEN' ? 403 : decision.code === 'NOT_FOUND' ? 404 : 400
    return NextResponse.json({ success: false, error: decision.message, code: decision.code }, { status })
  }

  // Atomic enforcement + audit inside the SQL function.
  const { data, error } = await supabaseAdmin.rpc('set_ultra_admin', {
    p_actor: cs.user.id, p_target: targetId, p_grant: grant,
  })
  if (error) {
    const code = error.message.split(':')[0]?.trim()
    const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : 400
    return NextResponse.json({ success: false, error: error.message, code }, { status })
  }

  return NextResponse.json({ success: true, data })
}
