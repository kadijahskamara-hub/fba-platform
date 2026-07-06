'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { resolvePrice } from '@/lib/pricing'
import type { Product, SessionUser } from '@/lib/types'

interface ProductCardProps {
  product: Product
  session: SessionUser | null
  onQuickView?: (product: Product) => void
  onSaveToProject?: (product: Product) => void
}

export function ProductCard({ product, session, onQuickView, onSaveToProject }: ProductCardProps) {
  const [saved, setSaved] = useState(false)
  const price = resolvePrice(product, session)
  const img   = product.images?.[0] ?? `https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?auto=compress&cs=tinysrgb&w=800`

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!session) {
      window.location.href = `/login?next=/products/${product.slug}`
      return
    }
    setSaved(s => !s)
    onSaveToProject?.(product)
  }

  return (
    <article className="product-card">
      <Link href={`/products/${product.slug}`} className="product-card-image" style={{ display: 'block' }}>
        <Image src={img} alt={product.name} fill style={{ objectFit: 'cover' }} sizes="(max-width:768px) 50vw, 25vw" />

        {/* FBA Collection badge */}
        {product.isFbaCollection && (
          <div style={{
            position: 'absolute', top: 12, left: 12, zIndex: 2,
            background: 'var(--forest)', color: 'var(--cream)',
            fontSize: 9, fontWeight: 600, letterSpacing: '0.2em',
            textTransform: 'uppercase', padding: '4px 10px',
          }}>
            FBA Collection
          </div>
        )}

        {/* Hover actions */}
        <div className="product-card-actions">
          <button
            className="product-card-action"
            onClick={e => { e.preventDefault(); onQuickView?.(product) }}
            title="Quick view"
          >
            Quick View
          </button>
          <button
            className="product-card-action"
            onClick={handleSave}
            title={saved ? 'Saved' : 'Save to project'}
            style={saved ? { background: 'var(--sage-bg)', color: 'var(--forest)' } : {}}
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </Link>

      <div className="product-card-meta">
        {product.category && (
          <div className="product-card-cat">{product.category.name}</div>
        )}
        <Link href={`/products/${product.slug}`}>
          <div className="product-card-name">{product.name}</div>
        </Link>
        {/* Brand/artisan hidden on public cards unless explicitly approved (site brief §7.4) */}
        {product.artisan && ((product as unknown as Record<string, unknown>).public_brand_visible === true || product.publicBrandVisible === true) && (
          <Link href={`/artisans/${product.artisan.slug}`}>
            <div className="product-card-artisan">{product.artisan.name}</div>
          </Link>
        )}
        <div className={`product-card-price${price.type === 'request' ? ' por' : session?.role === 'trade_user' || session?.role === 'admin' ? ' trade' : ''}`}>
          {price.type === 'fixed' ? price.label : 'Price on request'}
        </div>
      </div>
    </article>
  )
}
