import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { token, email, password } = await req.json()

    if (!token || !email || !password) {
      return NextResponse.json(
        { success: false, error: 'Token, email, and new password are required.' },
        { status: 400 }
      )
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters.' },
        { status: 400 }
      )
    }

    const normalised = email.toLowerCase().trim()

    // Look up the user
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, status')
      .eq('email', normalised)
      .single()

    if (!user || user.status === 'suspended') {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired reset link.' },
        { status: 400 }
      )
    }

    // Find a valid, unused, non-expired token for this user
    const { data: tokens } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('id, token_hash, expires_at')
      .eq('user_id', user.id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(5) // Check the most recent few tokens

    if (!tokens || tokens.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired reset link. Please request a new one.' },
        { status: 400 }
      )
    }

    // Verify the raw token against stored hashes
    let matchedId: string | null = null
    for (const t of tokens) {
      const matches = await bcrypt.compare(token, t.token_hash)
      if (matches) {
        matchedId = t.id
        break
      }
    }

    if (!matchedId) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired reset link. Please request a new one.' },
        { status: 400 }
      )
    }

    // Hash the new password
    const newHash = await bcrypt.hash(password, 12)

    // Update password and mark token as used in parallel
    const [pwResult] = await Promise.all([
      supabaseAdmin
        .from('users')
        .update({ password_hash: newHash })
        .eq('id', user.id),
      supabaseAdmin
        .from('password_reset_tokens')
        .update({ used: true })
        .eq('id', matchedId),
    ])

    if (pwResult.error) {
      console.error('[reset-password] Failed to update password:', pwResult.error)
      return NextResponse.json(
        { success: false, error: 'Failed to update password. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('[reset-password] Error:', err)
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 })
  }
}
