'use client'

import { useState } from 'react'

interface AddToBagButtonProps {
  product: {
    id: string
    slug: string
    name: string
    images?: string[]
    artisan?: { name: string } | null
  }
  price: { type: 'fixed'; amount: number; currency: string } | { type: 'request' }
}

interface CartItem {
  id: string
  slug: string
  name: string
  image: string | null
  artisan: string | null
  price: string | null
  priceAmount: number    // pence / cents (0 = price on request)
  currency: string
  quantity: number
}

function getCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('fba_cart') ?? '[]') }
  catch { return [] }
}

function saveCart(items: CartItem[]) {
  localStorage.setItem('fba_cart', JSON.stringify(items))
  window.dispatchEvent(new Event('fba-cart-update'))
}

export function AddToBagButton({ product, price }: AddToBagButtonProps) {
  const [added, setAdded] = useState(false)

  const handleAdd = () => {
    const cart = getCart()
    const existing = cart.find(i => i.id === product.id)

    const priceLabel = price.type === 'fixed'
      ? (price.currency === 'GBP' ? '£' : price.currency === 'EUR' ? '€' : '$') +
        price.amount.toLocaleString('en-GB', { minimumFractionDigits: 0 })
      : null

    // Amounts stored in minor units (pence). Products are stored as pounds in DB,
    // so multiply by 100.
    const priceAmount = price.type === 'fixed' ? Math.round(price.amount * 100) : 0
    const currency    = price.type === 'fixed' ? price.currency : 'GBP'

    if (existing) {
      saveCart(cart.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      const newItem: CartItem = {
        id:          product.id,
        slug:        product.slug,
        name:        product.name,
        image:       product.images?.[0] ?? null,
        artisan:     product.artisan?.name ?? null,
        price:       priceLabel,
        priceAmount,
        currency,
        quantity:    1,
      }
      saveCart([...cart, newItem])
    }

    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <button
      className="btn btn-primary btn-full btn-lg"
      onClick={handleAdd}
      style={added ? { background: 'var(--forest)', opacity: 0.85 } : undefined}
    >
      {added ? '✓ Added to Bag' : 'Add to Bag'}
    </button>
  )
}
