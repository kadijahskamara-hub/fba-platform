import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { StaffEditor } from '@/components/StaffEditor'
import type { StaffRow } from '@/lib/types'

export const metadata = { title: 'Staff & Permissions' }

async function getActiveStaff(): Promise<StaffRow[]> {
  const { data } = await supabaseAdmin
    .from('users')
    .select(`
      id, first_name, last_name, email, role, status, created_at,
      staff_permissions(permissions)
    `)
    .in('role', ['admin', 'staff'])
    .neq('status', 'archived')
    .order('created_at')
  return (data ?? []) as StaffRow[]
}

async function getArchivedCount(): Promise<number> {
  const { count } = await supabaseAdmin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .in('role', ['admin', 'staff'])
    .eq('status', 'archived')
  return count ?? 0
}

export default async function AdminStaffPage() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    redirect('/admin/dashboard')
  }

  const [staff, archivedCount] = await Promise.all([
    getActiveStaff(),
    getArchivedCount(),
  ])

  return (
    <StaffEditor
      initialStaff={staff}
      currentUserId={session.id}
      archivedCount={archivedCount}
    />
  )
}
