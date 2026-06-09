import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import type { StaffPermission } from '@/lib/types'

/**
 * Settings sub-layout: only admins, or staff who have the 'settings' permission.
 * Staff without 'settings' are bounced to the dashboard.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  if (!session) {
    redirect('/login?next=/admin/settings')
  }

  // Admins always have full access
  if (session.role === 'admin') {
    return <>{children}</>
  }

  // Staff: fetch their permissions and verify 'settings' is granted
  if (session.role === 'staff') {
    const { data } = await supabaseAdmin
      .from('staff_permissions')
      .select('permissions')
      .eq('user_id', session.id)
      .single()

    const perms: StaffPermission[] = data?.permissions ?? []
    if (perms.includes('settings')) {
      return <>{children}</>
    }
  }

  // Everyone else — redirect with a clear error param
  redirect('/admin/dashboard?error=no_settings_access')
}
