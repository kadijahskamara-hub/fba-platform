import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { ArchivedStaffViewer } from '@/components/ArchivedStaffViewer'
import type { StaffRow } from '@/lib/types'

export const metadata = { title: 'Archived Staff' }

async function getArchivedStaff(): Promise<StaffRow[]> {
  const { data } = await supabaseAdmin
    .from('users')
    .select(`
      id, first_name, last_name, email, role, status, created_at,
      staff_permissions(permissions)
    `)
    .in('role', ['admin', 'staff'])
    .eq('status', 'archived')
    .order('created_at', { ascending: false })
  return (data ?? []) as StaffRow[]
}

export default async function ArchivedStaffPage() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    redirect('/admin/dashboard')
  }

  const staff = await getArchivedStaff()

  return (
    <div>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Archived Staff</h1>
          <p className="admin-subtitle">
            {staff.length} archived member{staff.length !== 1 ? 's' : ''} — no longer active
          </p>
        </div>
        <Link href="/admin/settings/staff" className="btn btn-secondary btn-sm">
          ← Active Staff
        </Link>
      </div>

      {staff.length > 0 && (
        <div style={{
          background: 'rgba(196,168,130,0.08)',
          border: '1px solid var(--light-line)',
          padding: '12px 16px',
          marginBottom: 24,
          fontSize: 12,
          color: 'var(--stone)',
          letterSpacing: '0.02em',
        }}>
          Archived staff cannot log in. Restoring a member reactivates their account and preserves their previous permissions.
        </div>
      )}

      <ArchivedStaffViewer initialStaff={staff} />
    </div>
  )
}
