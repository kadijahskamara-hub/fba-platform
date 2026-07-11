import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { resolveAckToken } from '@/lib/commercial/purchaseOrders'
import { logAudit } from '@/lib/audit'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { vString, vDate, ValidationError } from '@/lib/commercial/validation'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/supplier/purchase-orders/:token/acknowledge
//   { action: 'accept' | 'amend', name, email, expectedDate?, note? }
//
// Public, token-authenticated, rate-limited. Records acknowledgement
// name/email/timestamp or an amendment request. Single-use per token.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = getClientIp(req)
  const rl = checkRateLimit(`supplier-po-ack:${ip}`, 10, 10 * 60 * 1000)
  if (!rl.allowed) return NextResponse.json({ success: false, error: 'Too many attempts. Please try again shortly.' }, { status: 429 })

  const resolved = await resolveAckToken(params.token)
  if ('error' in resolved) return NextResponse.json({ success: false, error: resolved.error }, { status: resolved.status })
  const { po, tokenRow } = resolved

  if (tokenRow.used_at) {
    return NextResponse.json({ success: false, error: 'This purchase order has already been responded to.' }, { status: 409 })
  }
  if (po.acknowledged_at) {
    return NextResponse.json({ success: false, error: 'This purchase order is already acknowledged.' }, { status: 409 })
  }

  try {
    const body = await req.json()
    const action = body.action === 'amend' ? 'amend' : 'accept'
    const name = vString(body.name, 'name', { required: true, max: 200 })!
    const email = vString(body.email, 'email', { required: true, max: 200 })!
    if (!EMAIL_RE.test(email)) return NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 })
    const note = vString(body.note, 'note', { max: 2000 })
    const expectedDate = vDate(body.expectedDate, 'expectedDate')

    await supabaseAdmin.from('purchase_order_ack_tokens')
      .update({ used_at: new Date().toISOString() }).eq('id', tokenRow.id as string)

    if (action === 'accept') {
      await supabaseAdmin.from('purchase_orders').update({
        status: 'acknowledged',
        acknowledged_by_name: name,
        acknowledged_by_email: email,
        acknowledged_at: new Date().toISOString(),
        acknowledgement_notes: note,
        expected_completion_date: expectedDate,
        updated_at: new Date().toISOString(),
      }).eq('id', po.id as string)

      await logAudit({
        actor: null, action: 'commercial.po_acknowledged', entityType: 'purchase_order', entityId: po.id as string,
        after: { name, email, expectedDate, revision: tokenRow.revision },
      })
    } else {
      await supabaseAdmin.from('purchase_orders').update({
        status: 'supplier_amendment_requested',
        acknowledgement_notes: note ?? 'Amendment requested',
        updated_at: new Date().toISOString(),
      }).eq('id', po.id as string)

      await logAudit({
        actor: null, action: 'commercial.po_amendment_requested', entityType: 'purchase_order', entityId: po.id as string,
        after: { name, email, note, revision: tokenRow.revision },
      })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Submission failed.' }, { status: 500 })
  }
}
