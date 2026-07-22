'use client'

// Recently viewed products (final amendments §6). Stored locally in
// the visitor's browser (no server round-trip, no account needed);
// records the current product on mount and renders up to four
// previously viewed pieces using the standard FBA product card.
// Renders nothing when there is no history.

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Entry {
  slug: string
  name: string
  image: string | null
  category: string | null
}

const KEY = 'fba.recentlyViewed'
const MAX_STORED = 8
const MAX_SHOWN = 4

export function RecentlyViewed({ current }: { current: Entry }) {
  const [items, setItems] = useState<Entry[]>([])

  useEffect(() => {
    let list: Entry[] = []
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          list = parsed.filter((e): e is Entry => e && typeof e.slug === 'string' && typeof e.name === 'string')
        }
      }
    } catch { /* blocked or corrupt — start fresh */ }

    // Show everything except the product being viewed…
    setItems(list.filter(e => e.slug !== current.slug).slice(0, MAX_SHOWN))

    // …then record the current product at the front.
    const next = [current, ...list.filter(e => e.slug !== current.slug)].slice(0, MAX_STORED)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage blocked */ }
  }, [current.slug]) // eslint-disable-line react-hooks/exhaustive-deps

  if (items.length === 0) return null

  return (
    <>
      <div className="divider-lg" />
      <div>
        <div className="label label-sage" style={{ marginBottom: 24 }}>Recently viewed</div>
        <div className="grid-4">
          {items.map(e => (
            <Link key={e.slug} href={`/products/${e.slug}`} style={{ display: 'block' }}>
              <div className="product-card">
                <div className="product-card-image" style={{ position: 'relative', background: 'var(--sage-light)' }}>
                  {e.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.image} alt={e.name} loading="lazy"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
                <div className="product-card-meta">
                  {e.category && (
                    <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 4 }}>
                      {e.category}
                    </div>
                  )}
                  <div className="product-card-name">{e.name}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
