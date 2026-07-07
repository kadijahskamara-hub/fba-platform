import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { supabaseAdmin } from '@/lib/supabase'
import { createSession } from '@/lib/auth'
import { sendStaffOtpEmail } from '@/lib/email'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import type { SessionUser } from '@/lib/types'

const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)

// 10 attempts per 15-minute window per IP
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 15 * 60 * 1000

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

export async function POST(req: NextRequest) {
  try {
    // Rate limiting — 10 attempts per 15 min per IP
    const ip = getClientIp(req)
    const rl = checkRateLimit(`login:${ip}`, RATE_LIMIT, RATE_WINDOW_MS)
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required.' },
        { status: 400 }
      )
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*') // '*' tolerates must_change_password not being migrated yet
      .eq('email', email.toLowerCase().trim())
      .single()

    if (error || !user) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password.' },
        { status: 401 }
      )
    }

    if (user.status === 'suspended') {
      return NextResponse.json(
        { success: false, error: 'Account suspended. Contact info@fullbloom.uk.com.' },
        { status: 403 }
      )
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash)
    if (!passwordOk) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password.' },
        { status: 401 }
      )
    }

    // OTP branch: staff and admin second factor.
    // OTP is DISABLED BY DEFAULT. To re-enable admin/staff 2FA, set the env var
    // ENABLE_OTP=true (in Vercel + .env.local) and confirm Resend email delivery
    // is working. Leaving ENABLE_OTP unset keeps 2FA off in all environments.
    const otpDisabled = process.env.ENABLE_OTP !== 'true'

    if (!otpDisabled && (user.role === 'admin' || user.role === 'staff')) {
      const code      = generateOtpCode()
      const codeHash  = await bcrypt.hash(code, 10)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

      await supabaseAdmin
        .from('staff_otps')
        .update({ used: true })
        .eq('user_id', user.id)
        .eq('used', false)

      await supabaseAdmin.from('staff_otps').insert({
        user_id:    user.id,
        code_hash:  codeHash,
        expires_at: expiresAt.toISOString(),
        used:       false,
      })

      const sent = await sendStaffOtpEmail(user.email, user.first_name, code)
      if (!sent) {
        console.warn('[login] OTP email not sent for user:', user.id)
      }

      const tempToken = await createOtpToken(user.id)

      return NextResponse.json({
        success:     true,
        requiresOtp: true,
        tempToken,
        data: { role: user.role, firstName: user.first_name },
      })
    }

    // Direct session — used for retail/trade users, and admin/staff when DISABLE_OTP=true
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
      // True when an admin issued a temporary password — the client
      // must send the user to /account/change-password before anything else.
      mustChangePassword: user.must_change_password === true,
      data: { role: user.role, firstName: user.first_name },
    })

  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 })
  }
}
