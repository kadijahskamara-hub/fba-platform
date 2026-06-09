import { redirect } from 'next/navigation'
import { getSession, isStaffRole } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { AdminSidebar } from '@/components/AdminSidebar'
import type { StaffPermission } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: { default: 'Admin', template: '%s — FBA Admin' } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  if (!session || !isStaffRole(session)) {
    redirect('/login?next=/admin/dashboard')
  }

  // For staff (non-admin), fetch their granted permissions so the sidebar
  // can hide sections they cannot access. Admins get null = full access.
  let userPermissions: StaffPermission[] | null = null

  if (session.role === 'staff') {
    const { data } = await supabaseAdmin
      .from('staff_permissions')
      .select('permissions')
      .eq('user_id', session.id)
      .single()

    userPermissions = (data?.permissions ?? []) as StaffPermission[]
  }

  return (
    <div className="admin-layout" style={{ background: '#F4F1ED', minHeight: '100vh' }}>
      <AdminSidebar session={session} userPermissions={userPermissions} />
      <div className="admin-main">
        {children}
      </div>
    </div>
  )
}
