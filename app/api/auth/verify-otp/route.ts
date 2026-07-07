import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { jwtVerify } from 'jose'
import { supabaseAdmin } from '@/lib/supabase'
import { createSession } from '@/lib/auth'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import type { SessionUser } from '@/lib/types'

const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)

// 5 attempts per 10-minute window per IP (OTP codes are 6-digit — limit aggressively)
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    // Rate limiting — 5 attempts per 10 min per IP
    const ip = getClientIp(req)
    const rl = checkRateLimit(`otp:${ip}`, RATE_LIMIT, RATE_WINDOW_MS)
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

    const { tempToken, code } = await req.json()

    if (!tempToken || !code) {
      return NextResponse.json({ success: false, error: 'Missing token or code.' }, { status: 400 })
    }

    // 1 — Verify the temp token issued during login
    let userId: string
    try {
      const { payload } = await jwtVerify(tempToken, secret)
      if (payload.purpose !== 'otp') throw new Error('Wrong token purpose')
      userId = payload.sub as string
    } catch {
      return NextResponse.json({ success: false, error: 'Session expired. Please log in again.' }, { status: 401 })
    }

    // Per-user attempt limit — 3 wrong codes per OTP session, regardless of IP
    // This catches attackers who rotate IPs to bypass the IP-based limit above
    const userRl = checkRateLimit(`otp-user:${userId}`, 3, RATE_WINDOW_MS)
    if (!userRl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many incorrect attempts. Please log in again to request a new code.' },
        { status: 429, headers: { 'Retry-After': String(userRl.retryAfter) } }
      )
    }

    // 2 — Find the latest unused, unexpired OTP for this user
    const { data: otpRow } = await supabaseAdmin
      .from('staff_otps')
      .select('id, code_hash, expires_at, used')
      .eq('user_id', userId)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!otpRow) {
      return NextResponse.json({
        success: false,
        error: 'Code expired or not found. Please log in again.',
      }, { status: 401 })
    }

    // 3 — Compare the entered code against the stored hash
    const codeMatch = await bcrypt.compare(code.trim(), otpRow.code_hash)
    if (!codeMatch) {
      return NextResponse.json({ success: false, error: 'Incorrect code. Please try again.' }, { status: 401 })
    }

    // 4 — Mark OTP as used
    await supabaseAdmin
      .from('staff_otps')
      .update({ used: true })
      .eq('id', otpRow.id)

    // 5 — Fetch user and create a full session
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('*') // '*' tolerates must_change_password not being migrated yet
      .eq('id', userId)
      .single()

    if (!user || user.status === 'suspended') {
      return NextResponse.json({ success: false, error: 'Account not available.' }, { status: 403 })
    }

    const sessionUser: SessionUser = {
      id:        user.id,
      email:     user.email,
      role:      user.role,
      firstName: user.first_name,
      lastName:  user.last_name,
    }
    await createSession(sessionUser)

    return NextResponse.json({
      success: true,
      mustChangePassword: user.must_change_password === true,
      data: { role: user.role, firstName: user.first_name },
    })

  } catch (err) {
    console.error('Verify OTP error:', err)
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 })
  }
}
