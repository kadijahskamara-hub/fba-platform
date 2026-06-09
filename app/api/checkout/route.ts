import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { getSession } from '@/lib/auth'

// ── POST /api/checkout ──────────────────────────────────────
//
// Body: { items: CartItem[] }
//   CartItem: { id, slug, name, image, artisan, price, quantity }
//
// Returns: { url: string } — Stripe Checkout Session URL

interface CartItem {
  id: string
  slug: string
  name: string
  image: string | null
  artisan: string | null
  price: string | null    // display string e.g. "£1,200"
  priceAmount: number     // numeric pence value (100 = £1.00)
  currency: string        // 'GBP' | 'EUR' | 'USD'
  quantity: number
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const { items }: { items: CartItem[] } = await req.json()

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
    }

    // Separate purchasable items from price-on-request
    const purchasableItems = items.filter(i => i.priceAmount > 0)
    const porItems = items.filter(i => !i.priceAmount || i.priceAmount === 0)

    if (purchasableItems.length === 0) {
      // All items are price-on-request — redirect to quote flow
      return NextResponse.json(
        { error: 'All items are price on request', redirect: '/quote' },
        { status: 400 }
      )
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: purchasableItems.map(item => ({
        quantity: item.quantity,
        price_data: {
          currency: (item.currency ?? 'GBP').toLowerCase(),
          unit_amount: item.priceAmount, // already in pence/cents
          product_data: {
            name: item.name,
            description: item.artisan ? `by ${item.artisan}` : undefined,
            images: item.image ? [item.image] : [],
            metadata: {
              product_id: item.id,
              slug: item.slug,
            },
          },
        },
      })),
      shipping_address_collection: {
        allowed_countries: ['GB', 'US', 'FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'CH', 'SE', 'NO', 'DK', 'AE', 'SG', 'AU'],
      },
      ...(session?.email
        ? { customer_email: session.email }
        : {}),
      metadata: {
        user_id: session?.id ?? '',
        has_por_items: porItems.length > 0 ? 'true' : 'false',
        por_item_names: porItems.map(i => i.name).join(', '),
      },
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cart`,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    console.error('[checkout] error:', err)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
