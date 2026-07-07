import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { checkRateLimit } from '@/lib/rateLimit'

// POST /api/auth/change-password
// Logged-in users set a new password by confirming their current one.
// Also clears must_change_password (set when an admin issues a temp
// password) so the account returns to normal access.

const RATE_LIMIT = 5
const RATE_WINDOW_MS = 15 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'You must be logged in.' },
        { status: 401 }
      )
    }

    // 5 attempts per 15 minutes per account
    const rl = checkRateLimit(`change-password:${session.id}`, RATE_LIMIT, RATE_WINDOW_MS)
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

    const { currentPassword, newPassword } = await req.json()

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: 'Current and new passwords are required.' },
        { status: 400 }
      )
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'New password must be at least 8 characters.' },
        { status: 400 }
      )
    }

    if (newPassword === currentPassword) {
      return NextResponse.json(
        { success: false, error: 'New password must be different from the current one.' },
        { status: 400 }
      )
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', session.id)
      .single()

    if (!user || user.status === 'suspended') {
      return NextResponse.json(
        { success: false, error: 'Account not found or suspended.' },
        { status: 403 }
      )
    }

    const passwordOk = await bcrypt.compare(currentPassword, user.password_hash)
    if (!passwordOk) {
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect.' },
        { status: 400 }
      )
    }

    const newHash = await bcrypt.hash(newPassword, 12)

    // Clear the force-change flag alongside the new hash. If the
    // must_change_password column has not been migrated yet, retry
    // without it so the password change itself still succeeds.
    let { error } = await supabaseAdmin
      .from('users')
      .update({
        password_hash: newHash,
        must_change_password: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      ;({ error } = await supabaseAdmin
        .from('users')
        .update({ password_hash: newHash, updated_at: new Date().toISOString() })
        .eq('id', user.id))
    }

    if (error) {
      console.error('Change password update error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update password.' },
        { status: 500 }
      )
    }

    // Invalidate any outstanding reset tokens
    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('user_id', user.id)
      .eq('used', false)

    await logAudit({
      actor: session,
      action: 'user.password_changed',
      entityType: 'user',
      entityId: user.id,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Change password error:', err)
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 })
  }
}
