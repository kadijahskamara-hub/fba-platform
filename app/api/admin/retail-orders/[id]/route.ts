import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'

type Params = { params: { id: string } }

const VALID_TRANSITIONS: Record<string, string[]> = {
  paid:        ['processing', 'cancelled'],
  processing:  ['shipped', 'cancelled'],
  shipped:     ['completed'],
  completed:   [],
  cancelled:   ['refunded'],
  refunded:    [],
  pending:     ['paid', 'cancelled'],
}

// PATCH /api/admin/retail-orders/[id]
// Body: { status, tracking_number? }
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const { status: newStatus, tracking_number } = await req.json()

  // Fetch current order
  const { data: order, error: fetchErr } = await supabaseAdmin
    .from('retail_orders')
    .select('id, order_number, status, shipping_name, user_id, user:users(email, first_name)')
    .eq('id', id)
    .single()

  if (fetchErr || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Validate transition
  const allowed = VALID_TRANSITIONS[order.status as string] ?? []
  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from ${order.status} to ${newStatus}` },
      { status: 422 }
    )
  }

  // Build update payload
  const updates: Record<string, unknown> = {
    status:     newStatus,
    updated_at: new Date().toISOString(),
  }
  if (tracking_number !== undefined) updates.tracking_number = tracking_number
  if (newStatus === 'shipped')        updates.shipped_at = new Date().toISOString()

  const { error: updateErr } = await supabaseAdmin
    .from('retail_orders')
    .update(updates)
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  // Send shipping email when status → shipped
  if (newStatus === 'shipped') {
    const user = (order.user as unknown) as { email: string; first_name: string } | null
    if (user?.email) {
      await sendShippingEmail(
        user.email,
        user.first_name,
        order.order_number as string,
        tracking_number ?? null
      )
    }
  }

  return NextResponse.json({ ok: true })
}

async function sendShippingEmail(
  to: string,
  firstName: string,
  orderNumber: string,
  trackingNumber: string | null
) {
  const trackingBlock = trackingNumber
    ? `<div style="background:#F0EDE8;padding:16px 20px;margin:24px 0;">
        <div style="font-size:11px;color:#9E9589;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">Tracking reference</div>
        <div style="font-size:15px;font-family:monospace;color:#1A2B18;font-weight:500;">${trackingNumber}</div>
       </div>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#F7F3EE;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EE;padding:48px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0"
             style="background:#FDFAF7;border:1px solid #DDD5C8;max-width:540px;width:100%;">
        <tr>
          <td style="padding:36px 40px 28px;border-bottom:1px solid #DDD5C8;">
            <div style="font-family:Georgia,serif;font-size:22px;font-weight:300;color:#1A2B18;letter-spacing:0.08em;">
              Full Bloom Artelier
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="font-size:15px;color:#1A2B18;margin:0 0 16px;line-height:1.6;">
              Your order is on its way, ${firstName}.
            </p>
            <p style="font-size:14px;color:#6B6560;margin:0 0 8px;line-height:1.6;">
              Order <strong style="color:#1A2B18;">${orderNumber}</strong> has been dispatched.
            </p>
            ${trackingBlock}
            <p style="font-size:13px;color:#6B6560;margin:0;line-height:1.7;">
              Delivery timelines vary by shipping method and destination. If you have any questions
              about your delivery, please reply to this email or contact us at
              <a href="mailto:info@fullbloom.uk.com" style="color:#7A8C77;">info@fullbloom.uk.com</a>.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 32px;border-top:1px solid #DDD5C8;">
            <p style="font-size:11px;color:#9E9589;margin:0;letter-spacing:0.05em;">
              &copy; Full Bloom Artelier &bull; London &bull;
              <a href="https://fullbloom.uk.com" style="color:#7A8C77;text-decoration:none;">fullbloom.uk.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  await sendEmail({ to, subject: `Your order ${orderNumber} is on its way`, html })
}
