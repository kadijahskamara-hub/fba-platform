import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import type { StaffPermission } from '@/lib/types'

// PATCH /api/admin/staff/[id] — update role, status, or permissions
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const body = await req.json()
  const { role, status, permissions } = body as {
    role?: 'staff' | 'admin'
    status?: 'active' | 'suspended' | 'archived'
    permissions?: StaffPermission[]
  }

  // Runtime validation — TypeScript types are compile-time only
  const VALID_ROLES = ['staff', 'admin'] as const
  const VALID_STATUSES = ['active', 'suspended', 'archived'] as const
  if (role !== undefined && !VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
    return NextResponse.json({ success: false, error: 'Invalid role value' }, { status: 400 })
  }
  if (status !== undefined && !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    return NextResponse.json({ success: false, error: 'Invalid status value' }, { status: 400 })
  }

  // Update core user fields
  const updates: Record<string, unknown> = {}
  if (role)   updates.role   = role
  if (status) updates.status = status

  if (Object.keys(updates).length > 0) {
    const { error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', id)

    if (error) {
      console.error('Staff update error:', error)
      return NextResponse.json({ success: false, error: 'Failed to update user' }, { status: 500 })
    }
  }

  // Update permissions — onConflict:'user_id' updates the existing row
  if (permissions !== undefined) {
    const { error: permErr } = await supabaseAdmin
      .from('staff_permissions')
      .upsert(
        { user_id: id, permissions, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )

    if (permErr) {
      console.error('Permissions update error:', permErr)
      return NextResponse.json({ success: false, error: 'Failed to update permissions' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}

// DELETE /api/admin/staff/[id] — suspend a staff member
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAdmin()
    if (session.id === params.id) {
      return NextResponse.json(
        { success: false, error: 'Cannot deactivate your own account' },
        { status: 400 }
      )
    }
  } catch {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ status: 'suspended' })
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ success: false, error: 'Failed to deactivate user' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
