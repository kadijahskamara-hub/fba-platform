'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

type OrderState =
  | { status: 'loading' }
  | { status: 'confirmed'; orderNumber: string; customerName: string }
  | { status: 'error' }

function CheckoutSuccessPageContent() {
  const params = useSearchParams()
  const sessionId = params.get('session_id')
  const [state, setState] = useState<OrderState>({ status: 'loading' })

  useEffect(() => {
    if (!sessionId) {
      setState({ status: 'error' })
      return
    }

    // Poll /api/checkout/confirm to get order details
    fetch(`/api/checkout/confirm?session_id=${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.orderNumber) {
          // Clear cart
          if (typeof window !== 'undefined') {
            localStorage.removeItem('fba_cart')
            window.dispatchEvent(new Event('fba-cart-update'))
          }
          setState({
            status: 'confirmed',
            orderNumber: data.orderNumber,
            customerName: data.customerName ?? '',
          })
        } else {
          setState({ status: 'error' })
        }
      })
      .catch(() => setState({ status: 'error' }))
  }, [sessionId])

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center' }}>
      <div className="container-sm" style={{ padding: '80px 32px', textAlign: 'center', width: '100%' }}>

        {state.status === 'loading' && (
          <div>
            <div style={{
              width: 48, height: 48, border: '2px solid var(--light-line)',
              borderTop: '2px solid var(--forest)',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              margin: '0 auto 32px',
            }} />
            <p style={{ fontSize: 14, color: 'var(--stone)', letterSpacing: '0.08em' }}>
              Confirming your order…
            </p>
          </div>
        )}

        {state.status === 'confirmed' && (
          <div>
            {/* Tick */}
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--sage-light, #E4EAE3)', border: '1px solid var(--forest)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 32px',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                   stroke="var(--forest)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h1 className="h2" style={{ marginBottom: 16 }}>
              {state.customerName ? `Thank you, ${state.customerName.split(' ')[0]}.` : 'Order confirmed.'}
            </h1>

            <p style={{
              fontSize: 13, color: 'var(--stone)', letterSpacing: '0.08em',
              textTransform: 'uppercase', marginBottom: 8,
            }}>
              Order reference
            </p>
            <p style={{
              fontFamily: 'var(--font-serif)', fontSize: 22,
              color: 'var(--forest)', marginBottom: 32,
            }}>
              {state.orderNumber}
            </p>

            <p style={{
              fontSize: 14, color: 'var(--ink)', lineHeight: 1.8,
              maxWidth: 460, margin: '0 auto 40px',
            }}>
              A confirmation has been sent to your email. We'll be in touch with shipping
              details once your piece is prepared — lead times vary by maker.
            </p>

            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/collection" className="btn btn-primary">
                Continue browsing
              </Link>
              <Link href="/account/orders" className="btn btn-secondary">
                View my orders
              </Link>
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <div>
            <h2 className="h3" style={{ marginBottom: 16 }}>Something went wrong</h2>
            <p style={{ fontSize: 14, color: 'var(--stone)', marginBottom: 32, lineHeight: 1.7 }}>
              We couldn't confirm your order details. If payment was taken, your order has been
              placed — check your email for a confirmation, or{' '}
              <a href="mailto:info@fullbloom.uk.com" style={{ color: 'var(--caramel)' }}>
                contact us
              </a>.
            </p>
            <Link href="/collection" className="btn btn-secondary">
              Return to collection
            </Link>
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return <Suspense fallback={null}><CheckoutSuccessPageContent /></Suspense>
}
