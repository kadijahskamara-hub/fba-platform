import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/checkout/confirm?session_id=cs_...
// Called by /checkout/success to look up the order number for the session.

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 402 })
    }

    // Find the order by stripe_pi_id — may take a moment if webhook hasn't fired yet
    const piId = session.payment_intent as string | null
    let order = null

    if (piId) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data } = await supabaseAdmin
          .from('retail_orders')
          .select('order_number')
          .eq('stripe_pi_id', piId)
          .single()

        if (data) {
          order = data
          break
        }

        // Wait 1s and retry (webhook may be slightly delayed)
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    return NextResponse.json({
      orderNumber:  order?.order_number ?? null,
      customerName: session.customer_details?.name ?? null,
    })
  } catch (err) {
    console.error('[checkout/confirm]', err)
    return NextResponse.json({ error: 'Failed to confirm order' }, { status: 500 })
  }
}
