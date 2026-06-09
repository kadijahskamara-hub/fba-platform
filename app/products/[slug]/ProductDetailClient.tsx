'use client'

import { useState } from 'react'
import Image from 'next/image'

interface ProductDetailClientProps {
  product: { images?: string[]; name: string }
}

export function ProductDetailClient({ product }: ProductDetailClientProps) {
  const [activeImg, setActiveImg] = useState(0)
  const images = product.images?.length
    ? product.images
    : [`https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?auto=compress&cs=tinysrgb&w=1200`]

  return (
    <div>
      {/* Main image */}
      <div style={{ position: 'relative', aspectRatio: '4/5', overflow: 'hidden', background: 'var(--sage-light)' }}>
        <Image
          src={images[activeImg]}
          alt={product.name}
          fill
          style={{ objectFit: 'cover' }}
          sizes="(max-width:768px) 100vw, 50vw"
          priority
        />
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActiveImg(i)}
              style={{
                width: 72, height: 72, flexShrink: 0,
                border: i === activeImg ? '2px solid var(--forest)' : '2px solid transparent',
                overflow: 'hidden', position: 'relative', cursor: 'pointer',
              }}
            >
              <Image src={img} alt={`View ${i + 1}`} fill style={{ objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
