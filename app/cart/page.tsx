'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

type CartItem = {
  id: string
  slug: string
  name: string
  image: string | null
  artisan: string | null
  price: string | null
  priceAmount?: number   // minor units (pence). 0 or absent = price on request
  currency?: string
  quantity: number
}

function getCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem('fba_cart') ?? '[]')
  } catch {
    return []
  }
}

function saveCart(items: CartItem[]) {
  localStorage.setItem('fba_cart', JSON.stringify(items))
  window.dispatchEvent(new Event('fba-cart-update'))
}

export default function CartPage() {
  const [items, setItems]         = useState<CartItem[]>([])
  const [mounted, setMounted]     = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    setItems(getCart())
    const handler = () => setItems(getCart())
    window.addEventListener('fba-cart-update', handler)
    return () => window.removeEventListener('fba-cart-update', handler)
  }, [])

  const handleCheckout = async () => {
    setCheckingOut(true)
    setCheckoutError('')
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.redirect) {
          router.push(data.redirect)
          return
        }
        setCheckoutError(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setCheckoutError('Connection error. Please try again.')
    } finally {
      setCheckingOut(false)
    }
  }

  const [requestingQuote, setRequestingQuote] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [quoteSuccess, setQuoteSuccess] = useState(false)

  const handleRequestQuote = async () => {
    setRequestingQuote(true)
    setQuoteError('')
    try {
      const res = await fetch('/api/quote-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({ productId: i.id, quantity: i.quantity })),
          notes: 'Submitted from Quote Basket',
        }),
      })
      if (res.status === 401) {
        router.push('/login?next=/cart')
        return
      }
      const data = await res.json()
      if (!data.success) {
        setQuoteError(data.error ?? 'Something went wrong. Please try again.')
        return
      }
      setQuoteSuccess(true)
      setItems([])
      saveCart([])
    } catch {
      setQuoteError('Connection error. Please try again.')
    } finally {
      setRequestingQuote(false)
    }
  }

  // Subtotal of fixed-price items only
  const subtotal = items.reduce((sum, i) => {
    const amt = (i.priceAmount ?? 0) / 100
    return sum + amt * i.quantity
  }, 0)
  const hasFixedPrice = items.some(i => (i.priceAmount ?? 0) > 0)
  const hasPOR        = items.some(i => !i.priceAmount || i.priceAmount === 0)

  const updateQty = (id: string, qty: number) => {
    const updated = qty <= 0
      ? items.filter(i => i.id !== id)
      : items.map(i => i.id === id ? { ...i, quantity: qty } : i)
    setItems(updated)
    saveCart(updated)
  }

  const removeItem = (id: string) => {
    const updated = items.filter(i => i.id !== id)
    setItems(updated)
    saveCart(updated)
  }

  const clearCart = () => {
    setItems([])
    saveCart([])
  }

  if (!mounted) return null

  return (
    <div className="page-body">
      {/* Hero */}
      <div className="page-hero" style={{ paddingTop: 'calc(var(--nav-h) + 60px)', paddingBottom: 60 }}>
        <div className="page-hero-inner">
          <div className="label page-hero-label">Your Selection</div>
          <h1 className="page-hero-title">Quote Basket</h1>
          <p className="page-hero-desc">
            {items.length === 0 ? 'Your quote basket is empty.' : `${items.length} item${items.length !== 1 ? 's' : ''} awaiting your quote request`}
          </p>
        </div>
      </div>

      <div className="section">
        <div className="container">
          {quoteSuccess ? (
            <div className="empty-state">
              <div style={{ fontSize: 36, marginBottom: 16 }}>✓</div>
              <h3>Quote request submitted</h3>
              <p>A member of our team will respond within 2 business days with pricing, availability, and lead times.</p>
              <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
                <Link href="/products" className="btn btn-primary">Continue Browsing</Link>
                <Link href="/account" className="btn btn-secondary">My Account</Link>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <h3>Nothing here yet</h3>
              <p>Browse the Edit and add pieces to your quote basket.</p>
              <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
                <Link href="/products" className="btn btn-primary">Browse the Edit</Link>
                <Link href="/account/projects" className="btn btn-secondary">My Projects</Link>
              </div>
            </div>
          ) : (
            <div className="fba-grid-sidebar-md" style={{ gap: 40, alignItems: 'start' }}>

              {/* Items */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <h2 className="h4">Items</h2>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={clearCart}
                    style={{ fontSize: 12, color: 'var(--stone)' }}
                  >
                    Clear bag
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {items.map((item, idx) => (
                    <div key={item.id} style={{
                      display: 'flex',
                      gap: 20,
                      padding: '24px 0',
                      borderTop: idx === 0 ? '1px solid var(--light-line)' : undefined,
                      borderBottom: '1px solid var(--light-line)',
                    }}>
                      {/* Image */}
                      <div style={{
                        width: 100, height: 120, flexShrink: 0,
                        position: 'relative', overflow: 'hidden',
                        background: 'var(--sage-light)',
                      }}>
                        {item.image ? (
                          <Image src={item.image} alt={item.name} fill style={{ objectFit: 'cover' }} />
                        ) : (
                          <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={{ fontSize: 10, color: 'var(--stone)', letterSpacing: '0.1em' }}>FBA</span>
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div style={{ flex: 1 }}>
                        <Link href={`/products/${item.slug}`} style={{
                          fontFamily: 'var(--font-serif)',
                          fontSize: 18,
                          fontWeight: 300,
                          color: 'var(--forest)',
                          textDecoration: 'none',
                          display: 'block',
                          marginBottom: 4,
                        }}>
                          {item.name}
                        </Link>

                        {/* Quantity control */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            display: 'flex', alignItems: 'center',
                            border: '1px solid var(--light-line)',
                          }}>
                            <button
                              onClick={() => updateQty(item.id, item.quantity - 1)}
                              style={{
                                width: 32, height: 32, background: 'none', border: 'none',
                                cursor: 'pointer', fontSize: 14, color: 'var(--stone)',
                              }}
                            >−</button>
                            <span style={{ width: 32, textAlign: 'center', fontSize: 13 }}>
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQty(item.id, item.quantity + 1)}
                              style={{
                                width: 32, height: 32, background: 'none', border: 'none',
                                cursor: 'pointer', fontSize: 14, color: 'var(--stone)',
                              }}
                            >+</button>
                          </div>
                          <button
                            onClick={() => removeItem(item.id)}
                            style={{
                              background: 'none', border: 'none',
                              fontSize: 12, color: 'var(--stone)',
                              cursor: 'pointer', letterSpacing: '0.08em',
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      {/* Price */}
                      <div style={{ textAlign: 'right', minWidth: 80 }}>
                        {item.price ? (
                          <span style={{ fontWeight: 500, fontSize: 15, color: 'var(--forest)' }}>
                            {item.price}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--stone)', fontStyle: 'italic' }}>
                            Price on request
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Continue shopping */}
                <div style={{ marginTop: 24 }}>
                  <Link href="/products" style={{
                    fontSize: 12, color: 'var(--caramel)',
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    textDecoration: 'none',
                  }}>
                    ← Continue browsing
                  </Link>
                </div>
              </div>

              {/* Summary panel */}
              <div style={{ position: 'sticky', top: 'calc(var(--nav-h) + 24px)' }}>
                <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 32 }}>
                  <h3 className="h4" style={{ marginBottom: 24 }}>Summary</h3>

                  {hasPOR && (
                    <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--stone)', lineHeight: 1.7,
                                  background: 'var(--cream)', padding: '12px 16px',
                                  border: '1px solid var(--light-line)' }}>
                      One or more items is priced on request — request a quote and our
                      team will respond within 2 business days.
                    </div>
                  )}

                  <div style={{
                    paddingTop: 20, borderTop: '1px solid var(--light-line)',
                    marginBottom: 20, fontSize: 13,
                  }}>
                    {hasFixedPrice && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ color: 'var(--stone)' }}>Subtotal</span>
                        <span style={{ fontWeight: 500 }}>
                          £{subtotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--stone)' }}>Shipping</span>
                      <span style={{ fontStyle: 'italic', color: 'var(--stone)' }}>At checkout</span>
                    </div>
                  </div>

                  {(quoteError || checkoutError) && (
                    <p style={{ fontSize: 12, color: '#c0392b', marginBottom: 12, lineHeight: 1.5 }}>
                      {quoteError || checkoutError}
                    </p>
                  )}

                  <button
                    className="btn btn-primary btn-full"
                    style={{ marginBottom: 12 }}
                    onClick={handleRequestQuote}
                    disabled={requestingQuote}
                  >
                    {requestingQuote ? 'Submitting…' : 'Request Quote for these items'}
                  </button>

                  {hasFixedPrice && (
                    <button
                      className="btn btn-secondary btn-full"
                      style={{ marginBottom: 12 }}
                      onClick={handleCheckout}
                      disabled={checkingOut}
                    >
                      {checkingOut ? 'Redirecting…' : 'Checkout retail items'}
                    </button>
                  )}

                  <Link href="/account/projects" className="btn btn-secondary btn-full">
                    Save as project instead
                  </Link>

                  <p style={{ fontSize: 11, color: 'var(--stone)', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
                    Trade pricing available to approved accounts —{' '}
                    <Link href="/trade/apply" style={{ color: 'var(--caramel)' }}>apply for trade access</Link>.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
