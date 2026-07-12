import { NextRequest, NextResponse } from 'next/server'
import { hashAckToken } from '@/lib/commercial/purchaseOrders'
import { supabaseAdmin } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { vString, vDate, ValidationError } from '@/lib/commercial/validation'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/supplier/purchase-orders/:token/acknowledge
//   { action: 'accept' | 'amend', name, email, expectedDate?, note? }
//
// Public, token-authenticated, rate-limited. Token consumption and the PO
// status update are performed ATOMICALLY by acknowledge_purchase_order()
// (Sprint 3 correction) so a race cannot produce a duplicate response.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const params = await ctx.params
  const ip = getClientIp(req)
  const rl = checkRateLimit(`supplier-po-ack:${ip}`, 10, 10 * 60 * 1000)
  if (!rl.allowed) return NextResponse.json({ success: false, error: 'Too many attempts. Please try again shortly.' }, { status: 429 })

  const raw = params.token
  if (!raw || raw.length < 20 || raw.length > 100 || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    return NextResponse.json({ success: false, error: 'Invalid link.' }, { status: 400 })
  }

  try {
    const body = await req.json()
    const action = body.action === 'amend' ? 'amend' : 'accept'
    const name = vString(body.name, 'name', { required: true, max: 200 })!
    const email = vString(body.email, 'email', { required: true, max: 200 })!
    if (!EMAIL_RE.test(email)) return NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 })
    const note = vString(body.note, 'note', { max: 2000 })
    const expectedDate = vDate(body.expectedDate, 'expectedDate')

    const { data, error } = await supabaseAdmin.rpc('acknowledge_purchase_order', {
      p_token_hash: hashAckToken(raw), p_action: action,
      p_name: name, p_email: email, p_note: note, p_expected: expectedDate,
    })
    if (error) return NextResponse.json({ success: false, error: 'Submission failed.' }, { status: 500 })

    const res = data as { ok: boolean; error?: string; action?: string; po_id?: string }
    if (!res?.ok) {
      const map: Record<string, [string, number]> = {
        not_found: ['This link is not valid.', 404],
        revoked: ['This link has been superseded. Please use the most recent purchase order link.', 410],
        used: ['This purchase order has already been responded to.', 409],
        expired: ['This link has expired. Please contact Full Bloom Artelier for a new one.', 410],
        cancelled: ['This purchase order has been cancelled.', 410],
        already_acknowledged: ['This purchase order is already acknowledged.', 409],
      }
      const [msg, status] = map[res?.error ?? ''] ?? ['Submission failed.', 409]
      return NextResponse.json({ success: false, error: msg }, { status })
    }

    await logAudit({
      actor: null,
      action: res.action === 'amend' ? 'commercial.po_amendment_requested' : 'commercial.po_acknowledged',
      entityType: 'purchase_order', entityId: res.po_id ?? null,
      after: { name, email, expectedDate },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Submission failed.' }, { status: 500 })
  }
}
