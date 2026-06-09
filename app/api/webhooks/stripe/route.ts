import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import Stripe from 'stripe'

// Stripe requires the raw body for signature verification —
// disable Next.js body parsing for this route.
export const runtime = 'nodejs'

function generateOrderNumber(): string {
  const ts  = Date.now().toString(36).toUpperCase()
  const rnd = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `FBA-${ts}-${rnd}`
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sig     = req.headers.get('stripe-signature') ?? ''
  const secret  = process.env.STRIPE_WEBHOOK_SECRET ?? ''

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret)
  } catch (err) {
    console.error('[webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    await handleCheckoutCompleted(session)
  }

  return NextResponse.json({ received: true })
}

// ── Handle completed checkout ─────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  try {
    const userId    = session.metadata?.user_id || null
    const sessionId = session.id
    const currency  = (session.currency ?? 'gbp').toUpperCase()

    // Fetch full line items from Stripe (not included in webhook payload)
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
      expand: ['data.price.product'],
    })

    const totalAmount = (session.amount_total ?? 0) / 100

    // shipping_details is present in the payload but not in all SDK type versions
    type ShippingDetails = { name?: string | null; address?: Record<string, string | null> | null } | null
    const shipping = (session as unknown as { shipping_details?: ShippingDetails }).shipping_details ?? null
    const shippingName = shipping?.name ?? null
    const shippingAddr = shipping?.address
      ? Object.values(shipping.address).filter(Boolean).join(', ')
      : null

    const orderNumber = generateOrderNumber()

    // Create retail_order row
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('retail_orders')
      .insert({
        user_id:       userId || null,
        order_number:  orderNumber,
        status:        'paid',
        total_amount:  totalAmount,
        currency,
        shipping_name: shippingName,
        shipping_addr: shippingAddr,
        stripe_pi_id:  session.payment_intent as string | null,
      })
      .select('id')
      .single()

    if (orderErr || !order) {
      console.error('[webhook] failed to create order:', orderErr)
      return
    }

    // Create retail_order_items rows
    const orderItems = lineItems.data.map((li: Stripe.LineItem) => {
      const product = li.price?.product as Stripe.Product | null
      const productId = product?.metadata?.product_id ?? null
      return {
        order_id:     order.id,
        product_id:   productId || null,
        product_name: li.description ?? product?.name ?? 'Product',
        quantity:     li.quantity ?? 1,
        unit_price:   (li.price?.unit_amount ?? 0) / 100,
        total_price:  ((li.price?.unit_amount ?? 0) * (li.quantity ?? 1)) / 100,
      }
    })

    await supabaseAdmin.from('retail_order_items').insert(orderItems)

    // Send confirmation email
    const customerEmail = session.customer_details?.email ?? session.customer_email
    if (customerEmail) {
      const customerName = session.customer_details?.name ?? 'there'
      await sendOrderConfirmationEmail(
        customerEmail,
        customerName,
        orderNumber,
        orderItems,
        totalAmount,
        currency,
        shippingAddr ?? ''
      )
    }

    console.log(`[webhook] order created: ${orderNumber}`)
  } catch (err) {
    console.error('[webhook] handleCheckoutCompleted error:', err)
  }
}

// ── Order confirmation email ──────────────────────────────────

async function sendOrderConfirmationEmail(
  to: string,
  name: string,
  orderNumber: string,
  items: Array<{ product_name: string; quantity: number; unit_price: number; total_price: number }>,
  total: number,
  currency: string,
  shippingAddr: string
) {
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$'

  const itemRows = items
    .map(
      i => `
      <tr>
        <td style="padding:10px 0;font-size:13px;color:#1A2B18;border-bottom:1px solid #EDE8E3;">
          ${i.product_name} × ${i.quantity}
        </td>
        <td style="padding:10px 0;font-size:13px;color:#1A2B18;border-bottom:1px solid #EDE8E3;text-align:right;">
          ${sym}${i.total_price.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
        </td>
      </tr>`
    )
    .join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
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
            <p style="font-size:15px;color:#1A2B18;margin:0 0 8px;line-height:1.6;">
              Thank you, ${name}.
            </p>
            <p style="font-size:14px;color:#6B6560;margin:0 0 32px;line-height:1.6;">
              Your order <strong style="color:#1A2B18;">${orderNumber}</strong> has been received
              and is being prepared.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              ${itemRows}
              <tr>
                <td style="padding:16px 0 0;font-size:14px;font-weight:600;color:#1A2B18;">Total</td>
                <td style="padding:16px 0 0;font-size:14px;font-weight:600;color:#1A2B18;text-align:right;">
                  ${sym}${total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </table>

            ${shippingAddr ? `
            <div style="background:#F0EDE8;padding:16px 20px;margin-bottom:28px;">
              <div style="font-size:11px;color:#9E9589;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">
                Ships to
              </div>
              <div style="font-size:13px;color:#1A2B18;">${shippingAddr}</div>
            </div>` : ''}

            <p style="font-size:13px;color:#6B6560;margin:0;line-height:1.7;">
              We&rsquo;ll send a shipping confirmation with your tracking details once your order
              is dispatched. Lead times vary by piece — our team will be in touch if anything
              requires additional coordination.
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

  await sendEmail({ to, subject: `Order confirmed — ${orderNumber}`, html })
}
