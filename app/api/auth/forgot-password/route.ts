import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'
import { sendPasswordResetEmail } from '@/lib/email'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

// Always return the same response to prevent email enumeration
const OK = () => NextResponse.json({ success: true })

export async function POST(req: NextRequest) {
  try {
    // Throttle to prevent password-reset email bombing / enumeration probing.
    const rl = checkRateLimit(`forgot-pw:${getClientIp(req)}`, 4, 60_000)
    if (!rl.allowed) return OK() // silent throttle — don't reveal anything

    const { email } = await req.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Email is required.' },
        { status: 400 }
      )
    }

    const normalised = email.toLowerCase().trim()

    // Look up the user — but don't reveal whether they exist
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, first_name, email, status')
      .eq('email', normalised)
      .single()

    // If no user, return OK silently (don't reveal email doesn't exist)
    if (!user || user.status === 'suspended') return OK()

    // Generate a 48-byte random token (URL-safe base64)
    const rawToken  = randomBytes(48).toString('base64url')
    const tokenHash = await bcrypt.hash(rawToken, 10)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Invalidate any existing unused tokens for this user
    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('user_id', user.id)
      .eq('used', false)

    // Store the new token
    const { error: insertError } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({
        user_id:    user.id,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        used:       false,
      })

    if (insertError) {
      console.error('[forgot-password] DB insert error:', insertError)
      return OK() // Still return OK to avoid revealing server errors
    }

    // Build the reset URL — include the raw token in the link
    const baseUrl   = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    const resetUrl  = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(normalised)}`

    // Send the email (non-fatal)
    const sent = await sendPasswordResetEmail(user.email, user.first_name ?? '', resetUrl)
    if (!sent) {
      console.warn('[forgot-password] Reset email not sent for user:', user.id)
    }

    return OK()

  } catch (err) {
    console.error('[forgot-password] Error:', err)
    return OK() // Always OK to prevent enumeration
  }
}
