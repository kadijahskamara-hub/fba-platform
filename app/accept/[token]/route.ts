import { NextRequest, NextResponse } from 'next/server'
import { resolveAcceptanceToken } from '@/lib/commercial/acceptance'
import { getCommercialSettings } from '@/lib/commercial/settings'
import { renderClientAcceptancePage, esc } from '@/lib/commercial/invoiceDocuments'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

// GET /accept/:token — public, supplier-safe (client-facing) acceptance page.
// Single-purpose, high-entropy, hashed, expiring, revocable token bound to
// one issued revision. No client selling/margin internals beyond the document.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = getClientIp(req)
  const rl = checkRateLimit(`accept-view:${ip}`, 30, 10 * 60 * 1000)
  if (!rl.allowed) return new NextResponse('Too many requests. Please try again shortly.', { status: 429 })

  const resolved = await resolveAcceptanceToken(params.token)
  const headers = {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY',
  }
  if ('error' in resolved) {
    return new NextResponse(errorPage(resolved.error), { status: resolved.status, headers })
  }
  const settings = await getCommercialSettings()
  const html = renderClientAcceptancePage(resolved.data.document, {
    tokenPath: `/api/accept/${params.token}`,
    companyName: settings.company_legal_name,
    alreadyResponded: resolved.data.token.used_at ? { status: 'recorded' } : null,
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
