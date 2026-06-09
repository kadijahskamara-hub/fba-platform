import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import type { StaffPermission } from '@/lib/types'

// POST /api/admin/staff — create a new staff member
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { firstName, lastName, email, role, permissions, tempPassword } = body as {
    firstName: string
    lastName: string
    email: string
    role: 'staff' | 'admin'
    permissions: StaffPermission[]
    tempPassword: string
  }

  if (!firstName || !lastName || !email || !role || !tempPassword) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single()

  if (existing) {
    return NextResponse.json({ success: false, error: 'Email already in use' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(tempPassword, 12)

  const { data: newUser, error: createErr } = await supabaseAdmin
    .from('users')
    .insert({
      first_name:    firstName.trim(),
      last_name:     lastName.trim(),
      email:         email.toLowerCase().trim(),
      password_hash: passwordHash,
      role,
      status:        'active',
    })
    .select('id, first_name, last_name, email, role, status, created_at')
    .single()

  if (createErr || !newUser) {
    console.error('Staff create error:', createErr)
    return NextResponse.json({ success: false, error: 'Failed to create user' }, { status: 500 })
  }

  // Set permissions — onConflict:'user_id' is safe even on first insert
  if (role === 'staff' && permissions?.length) {
    await supabaseAdmin
      .from('staff_permissions')
      .upsert(
        { user_id: newUser.id, permissions },
        { onConflict: 'user_id' }
      )
  }

  return NextResponse.json({ success: true, data: newUser }, { status: 201 })
}
