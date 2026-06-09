import Link from 'next/link'

export const metadata = { title: 'Checkout cancelled — Full Bloom Artelier' }

export default function CheckoutCancelPage() {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center' }}>
      <div className="container-sm" style={{ padding: '80px 32px', textAlign: 'center', width: '100%' }}>

        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--warm-white)', border: '1px solid var(--light-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 32px',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="var(--stone)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>

        <h1 className="h3" style={{ marginBottom: 12 }}>Checkout cancelled</h1>
        <p style={{ fontSize: 14, color: 'var(--stone)', lineHeight: 1.8, marginBottom: 40, maxWidth: 400, margin: '0 auto 40px' }}>
          No payment was taken. Your cart is still saved.
        </p>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/cart" className="btn btn-primary">
            Return to cart
          </Link>
          <Link href="/collection" className="btn btn-secondary">
            Continue browsing
          </Link>
        </div>

      </div>
    </div>
  )
}
