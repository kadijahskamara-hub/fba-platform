import { supabaseAdmin } from './supabase'

// ============================================================
// Contact ↔ user account enrichment (Phase 4.1).
//
// Contacts in the CRM list default to their contact_type ("Retail"),
// which is misleading when the person actually holds a staff/admin or
// trade account. This resolves each contact's real appointed status by
// matching their email to a user account.
//
// The "Ultra Admin" is the founding (earliest-created) admin account.
// The display label lives in ./contactRoleLabel (client-safe).
// ============================================================

export type AccountInfo = { role: string; isOwner: boolean }

export async function buildAccountInfoMap(): Promise<Map<string, AccountInfo>> {
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('email, role, created_at')

  const rows = users ?? []

  // Owner = earliest-created admin.
  let ownerEmail: string | null = null
  let ownerAt = Infinity
  for (const u of rows) {
    if ((u as { role?: string }).role === 'admin') {
      const t = new Date((u as { created_at?: string }).created_at ?? '').getTime()
      if (t < ownerAt) { ownerAt = t; ownerEmail = ((u as { email?: string }).email ?? '').toLowerCase() }
    }
  }

  const map = new Map<string, AccountInfo>()
  for (const u of rows) {
    const email = ((u as { email?: string }).email ?? '').toLowerCase()
    if (!email) continue
    const role = (u as { role?: string }).role ?? ''
    map.set(email, { role, isOwner: email === ownerEmail })
  }
  return map
}
