import { getSession } from './auth'
import { supabaseAdmin } from './supabase'
import type { SessionUser } from './types'

// Pipeline access (Phase 2.6): admins always; staff only when granted the
// existing `quote_pipeline` permission. Returns the session when allowed,
// otherwise null. Whoever has access gets full control of the whole pipeline.
export async function getPipelineSession(): Promise<SessionUser | null> {
  const session = await getSession()
  if (!session) return null
  if (session.role === 'admin') return session
  if (session.role === 'staff') {
    const { data } = await supabaseAdmin
      .from('staff_permissions')
      .select('permissions')
      .eq('user_id', session.id)
      .single()
    const perms = (data?.permissions ?? []) as string[]
    if (perms.includes('quote_pipeline')) return session
  }
  return null
}
