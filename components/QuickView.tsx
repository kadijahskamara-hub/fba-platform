'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { resolvePrice } from '@/lib/pricing'
import type { Product, SessionUser } from '@/lib/types'

interface QuickViewProps {
  product: Product
  session: SessionUser | null
  onClose: () => void
  onSaveToProject?: (product: Product) => void
}

export function QuickView({ product, session, onClose, onSaveToProject }: QuickViewProps) {
  const [activeImg, setActiveImg] = useState(0)
  const price = resolvePrice(product, session)
  const images = product.images?.length ? product.images : [
    `https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?auto=compress&cs=tinysrgb&w=800`
  ]
  const specs = product.specifications

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 860 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="quick-view">
          {/* Images */}
          <div className="quick-view-images" style={{ position: 'relative' }}>
            <div style={{ position: 'relative', aspectRatio: '1/1' }}>
              <Image
                src={images[activeImg]}
                alt={product.name}
                fill style={{ objectFit: 'cover' }}
              />
            </div>
            {images.length > 1 && (
              <div style={{ display: 'flex', gap: 8, padding: 12 }}>
                {images.map((img, i) => (
                  <button key={i} onClick={() => setActiveImg(i)}
                    style={{
                      width: 56, height: 56, flexShrink: 0, overflow: 'hidden',
                      border: i === activeImg ? '2px solid var(--forest)' : '2px solid transparent',
                      position: 'relative',
                    }}>
                    <Image src={img} alt="" fill style={{ objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="quick-view-body">
            {product.artisan && (
              <div className="qv-artisan">{product.artisan.name} · {product.artisan.location}</div>
            )}
            <h2 className="qv-name">{product.name}</h2>

            {/* Price */}
            <div className="qv-price">
              {price.type === 'fixed' ? (
                <span style={{ color: session?.role === 'trade_user' ? 'var(--caramel)' : 'var(--forest)' }}>
                  {price.label}
                  {(session?.role === 'trade_user' || session?.role === 'admin') && (
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
                      background: 'var(--sand)', color: 'var(--forest)', padding: '2px 8px', marginLeft: 10 }}>
                      Trade
                    </span>
                  )}
                </span>
              ) : (
                <span style={{ fontStyle: 'italic', color: 'var(--stone)' }}>Price on request</span>
              )}
            </div>

            <p className="qv-desc">{product.shortDescription ?? product.description.substring(0, 200)}</p>

            {/* Key specs */}
            {specs && (
              <div style={{ marginBottom: 24 }}>
                {specs.dimensionsSummary && (
                  <div className="qv-spec-row">
                    <span className="qv-spec-label">Dimensions</span>
                    <span>{specs.dimensionsSummary}</span>
                  </div>
                )}
                {specs.material && (
                  <div className="qv-spec-row">
                    <span className="qv-spec-label">Material</span>
                    <span>{specs.material}</span>
                  </div>
                )}
                {specs.finish && (
                  <div className="qv-spec-row">
                    <span className="qv-spec-label">Finish</span>
                    <span>{specs.finish}</span>
                  </div>
                )}
                {product.leadTime && (
                  <div className="qv-spec-row">
                    <span className="qv-spec-label">Lead time</span>
                    <span>{product.leadTime}</span>
                  </div>
                )}
                {specs.comAvailable && (
                  <div className="qv-spec-row">
                    <span className="qv-spec-label">COM</span>
                    <span>Available</span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link href={`/products/${product.slug}`} className="btn btn-primary btn-full">
                View Full Details
              </Link>
              <button
                className="btn btn-secondary btn-full"
                onClick={() => onSaveToProject?.(product)}
              >
                Save to Project
              </button>
              {product.referenceCode && (
                <p style={{ fontSize: 11, color: 'var(--stone)', textAlign: 'center', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Ref: {product.referenceCode}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
