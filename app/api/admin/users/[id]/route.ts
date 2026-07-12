import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// PATCH /api/admin/users/[id] — suspend/reactivate a CUSTOMER account.
// Staff and admin accounts are managed via /api/admin/staff/[id].
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  let session
  try {
    session = await requireAdmin()
  } catch {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  if (session.id === params.id) {
    return NextResponse.json({ success: false, error: 'Cannot modify your own account here' }, { status: 400 })
  }

  const { status } = (await req.json()) as { status?: 'active' | 'suspended' }
  if (status !== 'active' && status !== 'suspended') {
    return NextResponse.json({ success: false, error: 'Invalid status value' }, { status: 400 })
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', params.id)
    .single()

  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }
  if (user.role === 'admin' || user.role === 'staff') {
    return NextResponse.json(
      { success: false, error: 'Staff accounts are managed under Staff & Permissions' },
      { status: 400 }
    )
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) {
    console.error('User status update error:', error)
    return NextResponse.json({ success: false, error: 'Failed to update user' }, { status: 500 })
  }

  await supabaseAdmin.from('audit_logs').insert({
    actor_id:    session.id,
    action:      status === 'suspended' ? 'user.suspended' : 'user.reactivated',
    entity_type: 'user',
    entity_id:   params.id,
  }).then(() => {}, () => {})

  return NextResponse.json({ success: true })
}
