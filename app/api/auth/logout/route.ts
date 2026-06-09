import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/auth'

// POST — called by the Sign out button
// NOTE: GET is intentionally not exposed — a GET /logout endpoint is a CSRF vector
// (a malicious link can silently log users out). Always use POST for state-changing operations.
export async function POST() {
  destroySession()
  return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'))
}
