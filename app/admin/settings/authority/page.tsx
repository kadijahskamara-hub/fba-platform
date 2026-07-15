import { supabaseAdmin } from '@/lib/supabase'
import { getCommercialSession } from '@/lib/commercial/permissions'
import { PlatformAuthorityManager, type AdminAccountRow } from '@/components/PlatformAuthorityManager'

// ============================================================
// Settings → Platform Authority (Sprint 7 Part B) — Ultra only.
// The settings layout already gates to admins/staff-with-settings;
// this page additionally requires a LIVE Ultra Admin check
// (is_ultra_admin lives in the DB, never in the JWT).
// ============================================================

export const metadata = { title: 'Platform Authority' }
export const dynamic = 'force-dynamic'

export default async function PlatformAuthorityPage() {
  const cs = await getCommercialSession()

  if (!cs || !cs.isUltraAdmin) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 400, marginBottom: 12 }}>
          Platform Authority
        </h1>
        <div style={{
          padding: '18px 22px', border: '1px solid var(--light-line)',
          background: 'var(--warm-white)', fontSize: 13, color: 'var(--stone)', lineHeight: 1.7,
        }}>
          This area is restricted to Ultra Admins — the platform owner and anyone
          she has appointed. Ordinary admin access does not include platform
          authority. If you believe you should have access, ask an existing
          Ultra Admin to grant it under Settings → Platform Authority.
        </div>
      </div>
    )
  }

  const [{ data: admins }, { count: ultraCount }] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, email, role, status, is_ultra_admin, created_at')
      .eq('role', 'admin')
      .neq('status', 'deleted')
      .order('created_at'),
    supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('is_ultra_admin', true)
      .eq('status', 'active'),
  ])

  return (
    <PlatformAuthorityManager
      initialAdmins={(admins ?? []) as AdminAccountRow[]}
      initialUltraCount={ultraCount ?? 0}
      selfId={cs.user.id}
    />
  )
}
