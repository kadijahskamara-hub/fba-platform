import 'server-only'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import type { SessionUser } from './types'

const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)
const COOKIE_NAME = 'fba_session'
const SESSION_DURATION = 60 * 60 * 24 * 7 // 7 days in seconds

// ── Create JWT + set cookie ──────────────────────────────────

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    sub:       user.id,
    email:     user.email,
    role:      user.role,
    firstName: user.firstName,
    lastName:  user.lastName,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret)

  ;(await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION,
  })

  return token
}

// ── Read current session ─────────────────────────────────────

export async function getSession(): Promise<SessionUser | null> {
  try {
    const token = (await cookies()).get(COOKIE_NAME)?.value
    if (!token) return null

    const { payload } = await jwtVerify(token, secret)
    return {
      id:        payload.sub as string,
      email:     payload.email as string,
      role:      payload.role as SessionUser['role'],
      firstName: payload.firstName as string,
      lastName:  payload.lastName as string,
    }
  } catch {
    return null
  }
}

// ── Destroy session ──────────────────────────────────────────

export async function destroySession() {
  ;(await cookies()).delete(COOKIE_NAME)
}

// ── Role helpers (synchronous — pass a session you already have) ──

export function isAdmin(session: SessionUser | null) {
  return session?.role === 'admin'
}

export function isStaffRole(session: SessionUser | null) {
  return session?.role === 'admin' || session?.role === 'staff'
}

export function isApprovedTrade(session: SessionUser | null) {
  return session?.role === 'trade_user' || session?.role === 'admin'
}

export function isLoggedIn(session: SessionUser | null): session is SessionUser {
  return session !== null
}

// ── Async guard helpers — read session + check in one call ────
// These are for use in API routes and server actions.

export async function isStaff(): Promise<boolean> {
  const session = await getSession()
  return session?.role === 'admin' || session?.role === 'staff'
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    throw new Error('Forbidden')
  }
  return session
}
