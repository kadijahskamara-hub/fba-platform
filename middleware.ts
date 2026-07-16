import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// Routes that require a logged-in session
const PROTECTED_ROUTES = ['/account', '/account/projects']

// Routes that require admin role
const ADMIN_ROUTES = ['/admin']

// Routes that require approved trade_user role
const TRADE_ROUTES = ['/trade/dashboard']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('fba_session')?.value

  // Admin API responses must never be cached by the browser or CDN —
  // stale GETs made freshly created records (delivery lines, accounting
  // periods, …) invisible until a manual refresh (QA item 11). Auth for
  // these routes stays inside each handler (requireCommercial etc.).
  if (pathname.startsWith('/api/admin')) {
    const response = NextResponse.next()
    response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate')
    return response
  }

  const isProtected = PROTECTED_ROUTES.some(r => pathname.startsWith(r))
  const isAdmin = ADMIN_ROUTES.some(r => pathname.startsWith(r))
  const isTrade = TRADE_ROUTES.some(r => pathname.startsWith(r))

  if (!isProtected && !isAdmin && !isTrade) {
    return NextResponse.next()
  }

  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)
    const { payload } = await jwtVerify(token, secret)
    const role = payload.role as string

    if (isAdmin && role !== 'admin' && role !== 'staff') {
      return NextResponse.redirect(new URL('/', request.url))
    }

    if (isTrade && role !== 'trade_user' && role !== 'admin') {
      return NextResponse.redirect(new URL('/trade/apply', request.url))
    }

    // Inject user info into headers for server components
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', payload.sub as string)
    requestHeaders.set('x-user-role', role)
    requestHeaders.set('x-user-email', payload.email as string)

    return NextResponse.next({ request: { headers: requestHeaders } })
  } catch {
    // Invalid or expired token — clear it and redirect to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete('fba_session')
    return response
  }
}

export const config = {
  matcher: [
    '/account/:path*',
    '/admin/:path*',
    '/api/admin/:path*',
    '/trade/dashboard/:path*',
  ],
}
