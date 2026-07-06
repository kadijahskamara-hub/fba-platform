import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { supabaseAdmin } from '@/lib/supabase'
import { sendStaffOtpEmail } from '@/lib/email'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)

function generateOtpCode(): string {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  const n = (array[0] % 900000) + 100000
  return String(n)
}

async function createOtpToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, purpose: 'otp' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret)
}

/**
 * POST /api/auth/resend-otp
 * Re-issues a two-step verification code for a login already in the OTP
 * step, so the user doesn't have to go back and log in again. Requires the
 * temp OTP token issued at login — never accepts an email/user directly.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)

    // Two-layer throttle: per IP and (below) per user, to prevent using this
    // as an email-bombing endpoint.
    const rl = checkRateLimit(`resend-otp:${ip}`, 4, 10 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment before trying again.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
      )
    }

    const { tempToken } = await req.json()
    if (!tempToken) {
      return NextResponse.json({ success: false, error: 'Missing token.' }, { status: 400 })
    }

    // Verify the login-issued OTP token
    let userId: string
    try {
      const { payload } = await jwtVerify(tempToken, secret)
      if (payload.purpose !== 'otp') throw new Error('Wrong token purpose')
      userId = payload.sub as string
    } catch {
      return NextResponse.json(
        { success: false, error: 'Your session expired. Please log in again.' },
        { status: 401 },
      )
    }

    // Per-user throttle — max 3 resends per 10 min regardless of IP
    const userRl = checkRateLimit(`resend-otp-user:${userId}`, 3, 10 * 60 * 1000)
    if (!userRl.allowed) {
      return NextResponse.json(
        { success: false, error: 'You have requested several codes. Please wait a few minutes or log in again.' },
        { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
      )
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, first_name, email, role, status')
      .eq('id', userId)
      .single()

    if (!user || user.status === 'suspended' || !['admin', 'staff'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Account not available.' }, { status: 403 })
    }

    // Invalidate any outstanding codes, then issue a fresh one
    const code      = generateOtpCode()
    const codeHash  = await bcrypt.hash(code, 10)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    await supabaseAdmin.from('staff_otps').update({ used: true }).eq('user_id', user.id).eq('used', false)
    await supabaseAdmin.from('staff_otps').insert({
      user_id:    user.id,
      code_hash:  codeHash,
      expires_at: expiresAt.toISOString(),
      used:       false,
    })

    const sent = await sendStaffOtpEmail(user.email, user.first_name, code)
    if (!sent) {
      console.warn('[resend-otp] OTP email not sent for user:', user.id)
      return NextResponse.json(
        { success: false, error: 'We could not send the email right now. Please try again shortly.' },
        { status: 502 },
      )
    }

    // Issue a fresh token so the 15-minute session window restarts too.
    const newToken = await createOtpToken(user.id)

    return NextResponse.json({ success: true, tempToken: newToken })
  } catch (err) {
    console.error('Resend OTP error:', err)
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 })
  }
}
