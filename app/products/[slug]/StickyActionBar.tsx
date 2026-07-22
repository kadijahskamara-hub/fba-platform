'use client'

// Restrained sticky action bar (final amendments §6): appears only
// once the primary product actions have scrolled out of view, shows
// the essentials (name, price/POR + dispatch line) and returns the
// user to the configuration area. Price display was resolved
// server-side with the viewer's permissions — nothing sensitive is
// computed here.

import { useEffect, useState } from 'react'

interface Props {
  productName: string
  priceLine: string        // e.g. "£2,450", "£2,450 · Trade price", "Price on request"
  dispatchLine: string | null
  actionLabel: string      // e.g. "Configure & enquire"
  targetId: string         // element to scroll back to (primary actions)
}

export function StickyActionBar({ productName, priceLine, dispatchLine, actionLabel, targetId }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const target = document.getElementById(targetId)
    if (!target || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      entries => {
        const e = entries[0]
        // Show the bar only after the actions area has scrolled ABOVE
        // the viewport (not while it is still below the fold on load).
        setVisible(!e.isIntersecting && e.boundingClientRect.top < 0)
      },
      { threshold: 0 }
    )
    io.observe(target)
    return () => io.disconnect()
  }, [targetId])

  const scrollBack = () => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className={`pdp-sticky-bar${visible ? ' visible' : ''}`} aria-hidden={!visible}>
      <div className="container pdp-sticky-inner">
        <span className="pdp-sticky-name">{productName}</span>
        <span style={{ whiteSpace: 'nowrap', fontSize: 14 }}>
          <strong>{priceLine}</strong>
          {dispatchLine && (
            <span style={{ fontSize: 12, color: 'var(--stone)', marginLeft: 10 }}>{dispatchLine}</span>
          )}
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={scrollBack} tabIndex={visible ? 0 : -1}>
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
