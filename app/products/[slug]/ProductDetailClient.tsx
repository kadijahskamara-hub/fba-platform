'use client'

// Product gallery (Sprint 12): structured product_media when available
// (finish-specific switching, alt text, roles) with graceful fallback to
// the legacy products.images array. Keyboard: ←/→ move between images.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { FINISH_MEDIA_EVENT, type PublicMedia } from './CuratedFinishes'

interface ProductDetailClientProps {
  product: { images?: string[]; name: string }
  media?: PublicMedia[]
}

export function ProductDetailClient({ product, media }: ProductDetailClientProps) {
  // Structured media first (primary first, then sort order); legacy fallback.
  const frames = useMemo(() => {
    const structured = (media ?? []).filter(m => ['primary', 'gallery', 'lifestyle', 'dimension_drawing'].includes(m.role))
    if (structured.length > 0) {
      return [...structured]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map(m => ({ id: m.id, url: m.url, alt: m.altText ?? product.name, finishOptionId: m.finishOptionId }))
    }
    const legacy = product.images?.length ? product.images : [
      'https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
    return legacy.map((url, i) => ({ id: `legacy-${i}`, url, alt: `${product.name} — view ${i + 1}`, finishOptionId: null as string | null }))
  }, [media, product.images, product.name])

  const [activeImg, setActiveImg] = useState(0)

  // QA fix (July 2026): when the underlying image list changes — an image
  // removed, reordered, or structured media replacing the legacy array —
  // reset to the primary image instead of keeping a stale index that can
  // display the wrong (or a removed) image in the main preview.
  const frameKey = frames.map(f => f.id).join('|')
  useEffect(() => { setActiveImg(0) }, [frameKey])

  // Finish-specific switching: the configurator announces the media id
  // linked to the newly selected finish; retain the main image when the
  // selected finish has no dedicated shot (md doc §4.4).
  useEffect(() => {
    const onFinish = (e: Event) => {
      const mediaId = (e as CustomEvent<{ mediaId: string | null }>).detail?.mediaId
      if (!mediaId) return
      const idx = frames.findIndex(f => f.id === mediaId)
      if (idx >= 0) setActiveImg(idx)
    }
    window.addEventListener(FINISH_MEDIA_EVENT, onFinish)
    return () => window.removeEventListener(FINISH_MEDIA_EVENT, onFinish)
  }, [frames])

  const step = useCallback((dir: -1 | 1) => {
    setActiveImg(i => (i + dir + frames.length) % frames.length)
  }, [frames.length])

  const active = frames[Math.min(activeImg, frames.length - 1)]

  return (
    <div role="group" aria-label={`${product.name} image gallery`}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
        if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
      }}>
      {/* Main image */}
      <div style={{ position: 'relative', aspectRatio: '4/5', overflow: 'hidden', background: 'var(--sage-light)' }}>
        <Image
          src={active.url}
          alt={active.alt}
          fill
          style={{ objectFit: 'cover' }}
          sizes="(max-width:768px) 100vw, 50vw"
          priority
        />
      </div>

      {/* Thumbnail strip — horizontally scrollable on small screens */}
      {frames.length > 1 && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {frames.map((f, i) => (
            <button
              key={f.id}
              onClick={() => setActiveImg(i)}
              aria-label={`Show image ${i + 1} of ${frames.length}${f.alt ? `: ${f.alt}` : ''}`}
              aria-current={i === activeImg}
              style={{
                width: 72, height: 72, flexShrink: 0,
                border: i === activeImg ? '2px solid var(--forest)' : '2px solid transparent',
                overflow: 'hidden', position: 'relative', cursor: 'pointer', padding: 0, background: 'none',
              }}
            >
              <Image src={f.url} alt="" fill style={{ objectFit: 'cover' }} sizes="72px" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
