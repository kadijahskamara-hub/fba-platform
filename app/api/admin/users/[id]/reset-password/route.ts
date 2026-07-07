import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { sendPasswordResetEmail } from '@/lib/email'

// POST /api/admin/users/[id]/reset-password
// mode 'link': email the user a reset link (preferred — admin never
//              knows the credential).
// mode 'temp': set a temporary password the admin shares securely
//              (for users locked out of their email).
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let session
  try {
    session = await requireAdmin()
  } catch {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { mode, tempPassword } = body as { mode: 'link' | 'temp'; tempPassword?: string }

  if (mode !== 'link' && mode !== 'temp') {
    return NextResponse.json({ success: false, error: 'Invalid mode' }, { status: 400 })
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, email, first_name, role, status')
    .eq('id', params.id)
    .single()

  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }

  // Invalidate any outstanding reset tokens either way
  await supabaseAdmin
    .from('password_reset_tokens')
    .update({ used: true })
    .eq('user_id', user.id)
    .eq('used', false)

  if (mode === 'temp') {
    if (!tempPassword || tempPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Temporary password must be at least 8 characters' },
        { status: 400 }
      )
    }
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    // Flag the account so the next login forces a password change.
    // If the must_change_password column has not been migrated yet,
    // retry without it so the temp password still gets set.
    let { error } = await supabaseAdmin
      .from('users')
      .update({
        password_hash: passwordHash,
        must_change_password: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      ;({ error } = await supabaseAdmin
        .from('users')
        .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
        .eq('id', user.id))
    }

    if (error) {
      console.error('Temp password set error:', error)
      return NextResponse.json({ success: false, error: 'Failed to set password' }, { status: 500 })
    }
  } else {
    // mode === 'link' — mirror the forgot-password flow
    const rawToken  = randomBytes(48).toString('base64url')
    const tokenHash = await bcrypt.hash(rawToken, 10)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    const { error: insertError } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({
        user_id:    user.id,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        used:       false,
      })

    if (insertError) {
      console.error('Reset token insert error:', insertError)
      return NextResponse.json({ success: false, error: 'Failed to create reset token' }, { status: 500 })
    }

    const baseUrl  = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(user.email)}`
    const sent = await sendPasswordResetEmail(user.email, user.first_name ?? '', resetUrl)

    if (!sent) {
      return NextResponse.json(
        { success: false, error: 'Could not send the reset email — check email settings' },
        { status: 500 }
      )
    }
  }

  // Best-effort audit trail
  await supabaseAdmin.from('audit_logs').insert({
    actor_id:    session.id,
    action:      mode === 'link' ? 'user.password_reset_link_sent' : 'user.temp_password_set',
    entity_type: 'user',
    entity_id:   user.id,
  }).then(() => {}, () => {})

  return NextResponse.json({ success: true })
}
