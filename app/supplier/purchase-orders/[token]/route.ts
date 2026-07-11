import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCommercialSettings } from '@/lib/commercial/settings'
import { resolveAckToken } from '@/lib/commercial/purchaseOrders'
import { renderSupplierAckPage, PoSnapshot } from '@/lib/commercial/poDocuments'
import { logAudit } from '@/lib/audit'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

// GET /supplier/purchase-orders/:token — public supplier-safe PO view
// with acknowledgement form. Token is single-purpose, high-entropy,
// stored hashed, bound to one PO revision, expiring and revocable.
// This page contains supplier costs only — never client selling
// prices, margins, fees, or other manufacturers.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = getClientIp(req)
  const rl = checkRateLimit(`supplier-po-view:${ip}`, 30, 10 * 60 * 1000)
  if (!rl.allowed) return new NextResponse('Too many requests. Please try again shortly.', { status: 429 })

  const resolved = await resolveAckToken(params.token)
  if ('error' in resolved) {
    return new NextResponse(errorPage(resolved.error), {
      status: resolved.status,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' },
    })
  }
  const { po, snapshot, tokenRow } = resolved

  // First-view logging (status: issued → viewed)
  if (!tokenRow.first_viewed_at) {
    await supabaseAdmin.from('purchase_order_ack_tokens')
      .update({ first_viewed_at: new Date().toISOString() }).eq('id', tokenRow.id as string)
    if (po.status === 'issued') {
      await supabaseAdmin.from('purchase_orders')
        .update({ status: 'viewed', updated_at: new Date().toISOString() }).eq('id', po.id as string)
    }
    await logAudit({
      actor: null, action: 'commercial.po_viewed', entityType: 'purchase_order', entityId: po.id as string,
      after: { revision: tokenRow.revision },
    })
  }

  const settings = await getCommercialSettings()
  const html = renderSupplierAckPage(snapshot as unknown as PoSnapshot, {
    tokenPath: `/api/supplier/purchase-orders/${params.token}`,
    companyIdentity: {
      legalName: settings.company_legal_name,
      regNumber: settings.company_registration_number,
      vatNumber: settings.vat_number,
      address: settings.registered_address,
      email: settings.invoice_email,
    },
    alreadyAcknowledged: po.acknowledged_at
      ? { name: (po.acknowledged_by_name as string) ?? 'the supplier', at: po.acknowledged_at as string }
      : null,
    amendmentRequested: po.status === 'supplier_amendment_requested',
  })

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',       // keep the token out of referrer headers
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Frame-Options': 'DENY',
    },
  })
}

function errorPage(message: string): string {
  const safe = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>Full Bloom Artelier</title>
<style>body{font-family:Georgia,serif;background:#EFEFEA;color:#555550;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border-top:3px solid #1B4332;padding:40px 48px;max-width:460px;text-align:center}
h1{color:#1B4332;font-weight:normal;font-size:20px;letter-spacing:.18em;text-transform:uppercase;margin:0 0 14px}</style></head>
<body><div class="card"><h1>Full Bloom Artelier</h1><p>${safe}</p></div></body></html>`
}
