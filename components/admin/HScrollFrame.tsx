'use client'

// ============================================================
// Horizontal scroll frame for wide admin tables.
//
// Wraps a table in a contained scroll region and adds a SECOND scrollbar
// above it, mirrored to the real one. Without the top bar a staff member
// has to scroll to the bottom of 50 rows to find the only control that
// reveals the columns on the right — the bar is also easy to miss once it
// sits under the pinned name column.
//
// The top bar is a presentational duplicate (aria-hidden) of a control
// that already exists, so it is kept out of the tab order and off screen
// readers. The real scroll region carries the accessible name and is
// focusable, so it can be scrolled with the arrow keys (WCAG 2.1.1).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  children: React.ReactNode
  /** Extra classes for the scroll region (e.g. admin-table-stickyid). */
  className?: string
  /** Accessible name for the scrollable region. */
  label: string
}

export default function HScrollFrame({ children, className = '', label }: Props) {
  const topRef  = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // Guards the two-way scrollLeft mirroring against a feedback loop.
  const syncing = useRef(false)

  const [contentWidth, setContentWidth] = useState(0)
  const [overflowing, setOverflowing]   = useState(false)

  const measure = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    setContentWidth(wrap.scrollWidth)
    // 1px tolerance: sub-pixel layout rounding otherwise shows a
    // permanent scrollbar on a table that actually fits.
    setOverflowing(wrap.scrollWidth - wrap.clientWidth > 1)
  }, [])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    measure()

    // Observing the table as well as the wrapper catches column
    // show/hide from "Customize columns" and content-driven width
    // changes, not just viewport resizes.
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    const table = wrap.querySelector('table')
    if (table) ro.observe(table)

    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  function mirror(from: HTMLDivElement | null, to: HTMLDivElement | null) {
    if (!from || !to || syncing.current) return
    syncing.current = true
    to.scrollLeft = from.scrollLeft
    // Released next frame so the mirrored element's own scroll event —
    // which fires asynchronously — does not bounce back.
    requestAnimationFrame(() => { syncing.current = false })
  }

  return (
    <>
      {overflowing && (
        <div
          ref={topRef}
          className="admin-scroll-top"
          aria-hidden="true"
          onScroll={() => mirror(topRef.current, wrapRef.current)}
        >
          <div style={{ width: contentWidth, height: 1 }} />
        </div>
      )}

      <div
        ref={wrapRef}
        className={`admin-table-wrap ${className}`.trim()}
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={() => mirror(wrapRef.current, topRef.current)}
      >
        {children}
      </div>
    </>
  )
}
