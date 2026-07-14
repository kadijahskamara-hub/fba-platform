import { NextRequest, NextResponse } from 'next/server'
import { resolveDeliveryConfirmationToken, isErr } from '@/lib/commercial/deliveries'
import { renderDeliveryConfirmationPage } from '@/lib/commercial/deliveryDocuments'
import { esc } from '@/lib/commercial/invoiceDocuments'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

// GET /delivery/confirm/:token — public site/client confirmation page.
// Single-purpose, high-entropy, hashed, expiring, revocable token bound
// to one delivery. No-price content only (guarded); mirrors the
// Sprint-3 acceptance route exactly: rate-limited, noindex, no-referrer,
// no-store, X-Frame-Options DENY.
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const params = await ctx.params
  const ip = getClientIp(req)
  const rl = checkRateLimit(`delivery-confirm-view:${ip}`, 30, 10 * 60 * 1000)
  if (!rl.allowed) return new NextResponse('Too many requests. Please try again shortly.', { status: 429 })

  const headers = {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY',
  }

  const resolved = await resolveDeliveryConfirmationToken(params.token)
  if (isErr(resolved)) {
    return new NextResponse(errorPage(resolved.error), { status: resolved.status, headers })
  }

  const { token, delivery, snapshot } = resolved.data
  const lines = ((delivery.lines ?? []) as Array<Record<string, unknown>>).map(l => ({
    id: l.id as string,
    quantity: Number(l.quantity),
  }))

  const html = renderDeliveryConfirmationPage(snapshot, {
    tokenPath: `/api/delivery/confirm/${params.token}`,
    deliveryLines: lines,
    alreadyConfirmed: token.used_at ? { at: token.used_at as string } : null,
  })
  return new NextResponse(html, { headers })
}

function errorPage(message: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>Full Bloom Artelier</title>
<style>body{font-family:Georgia,serif;background:#EFEFEA;color:#555550;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border-top:3px solid #1B4332;padding:40px 48px;max-width:460px;text-align:center}
h1{color:#1B4332;font-weight:normal;font-size:20px;letter-spacing:.18em;text-transform:uppercase;margin:0 0 14px}</style></head>
<body><div class="card"><h1>Full Bloom Artelier</h1><p>${esc(message)}</p></div></body></html>`
}
