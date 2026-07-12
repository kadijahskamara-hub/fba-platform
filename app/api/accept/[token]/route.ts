import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { recordClientAcceptance } from '@/lib/commercial/acceptance'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/accept/:token — public accept/decline. Form-encoded (from the
// acceptance page) or JSON. Rate-limited, single-use (enforced atomically by
// accept_commercial_document). IP is hashed, never stored raw.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const params = await ctx.params
  const ip = getClientIp(req)
  const rl = checkRateLimit(`accept-submit:${ip}`, 10, 10 * 60 * 1000)
  if (!rl.allowed) return respond(req, false, 'Too many attempts. Please try again shortly.', 429)

  let body: Record<string, unknown> = {}
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    body = await req.json().catch(() => ({}))
  } else {
    const form = await req.formData().catch(() => null)
    if (form) for (const [k, v] of form.entries()) body[k] = typeof v === 'string' ? v : ''
  }

  const action = body.action === 'decline' ? 'decline' : 'accept'
  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim()
  const note = body.note ? String(body.note).slice(0, 2000) : null
  if (!name || name.length > 200) return respond(req, false, 'Please enter your name.', 400)
  if (!EMAIL_RE.test(email) || email.length > 200) return respond(req, false, 'Please enter a valid email address.', 400)

  const ipHash = createHash('sha256').update(ip + '|fba-accept').digest('hex').slice(0, 32)
  const result = await recordClientAcceptance({
    raw: params.token, action, name, email, note,
    ipHash, userAgent: (req.headers.get('user-agent') ?? '').slice(0, 400),
  })
  if ('error' in result) return respond(req, false, result.error, result.status)
  return respond(req, true, action === 'decline' ? 'Thank you — your response has been recorded.' : 'Thank you — your acceptance has been recorded.', 200)
}

function respond(req: NextRequest, ok: boolean, message: string, status: number) {
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    return NextResponse.json({ success: ok, ...(ok ? { message } : { error: message }) }, { status })
  }
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>Full Bloom Artelier</title>
<style>body{font-family:Georgia,serif;background:#EFEFEA;color:#2c2c28;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border-top:3px solid #1B4332;padding:40px 48px;max-width:460px;text-align:center}
h1{color:#1B4332;font-weight:normal;font-size:20px;letter-spacing:.18em;text-transform:uppercase;margin:0 0 14px}</style></head>
<body><div class="card"><h1>Full Bloom Artelier</h1><p>${message.replace(/</g, '&lt;')}</p></div></body></html>`
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' } })
}
