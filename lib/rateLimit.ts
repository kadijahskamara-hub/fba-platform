import 'server-only'

/**
 * Simple in-memory rate limiter.
 *
 * ⚠ IMPORTANT: This works correctly on a single server process.
 * For serverless deployments (Vercel, AWS Lambda) with multiple instances,
 * replace the in-memory store with Redis / Upstash to share state across instances.
 */

interface Entry {
  count: number
  resetAt: number
}

const store = new Map<string, Entry>()

// Prune stale entries every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(key)
    }
  }, 5 * 60 * 1000)
}

/**
 * Check whether `key` is within its rate limit.
 *
 * @param key       - Unique identifier (e.g. IP + route)
 * @param limit     - Maximum requests allowed within the window
 * @param windowMs  - Window duration in milliseconds
 * @returns `{ allowed: true }` or `{ allowed: false, retryAfter: seconds }`
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    }
  }

  entry.count++
  return { allowed: true }
}

/**
 * Get the best available client IP from request headers.
 * Falls back to a generic key when IP cannot be determined.
 */
export function getClientIp(req: Request): string {
  return (
    (req.headers as Headers).get('x-forwarded-for')?.split(',')[0]?.trim() ??
    (req.headers as Headers).get('x-real-ip') ??
    'unknown'
  )
}
