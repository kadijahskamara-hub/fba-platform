'use client'

// ============================================================
// Live headline price (QA fix, July 2026 — end-to-end product
// test item 7). The server renders the base resolved price; this
// client component listens for finish-option price adjustments
// announced by CuratedFinishes and updates the headline so the
// customer always sees the true configured cost, not just a small
// note under the swatches.
// ============================================================

import { useEffect, useState } from 'react'

export const PRICE_ADJUSTMENT_EVENT = 'fba:price-adjustment'

function fmt(currencySymbol: string, n: number): string {
  const opts = Number.isInteger(n)
    ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  return `${currencySymbol}${n.toLocaleString('en-GB', opts)}`
}

export default function LivePrice({ baseAmount, currencySymbol, isTrade }: {
  baseAmount: number
  currencySymbol: string
  isTrade: boolean
}) {
  const [adjustment, setAdjustment] = useState(0)

  useEffect(() => {
    const onAdjust = (e: Event) => {
      const total = (e as CustomEvent<{ total?: number }>).detail?.total
      setAdjustment(typeof total === 'number' && Number.isFinite(total) ? total : 0)
    }
    window.addEventListener(PRICE_ADJUSTMENT_EVENT, onAdjust)
    return () => window.removeEventListener(PRICE_ADJUSTMENT_EVENT, onAdjust)
  }, [])

  const total = baseAmount + adjustment

  return (
    <div aria-live="polite">
      <div style={{ fontSize: 20, fontWeight: 500, color: isTrade ? 'var(--caramel)' : 'var(--forest)' }}>
        {fmt(currencySymbol, total)}
      </div>
      {adjustment !== 0 && (
        <div style={{ fontSize: 11, color: 'var(--stone)', marginTop: 2 }}>
          Base {fmt(currencySymbol, baseAmount)} {adjustment > 0 ? '+' : '−'} {fmt(currencySymbol, Math.abs(adjustment))} selected finish options
        </div>
      )}
    </div>
  )
}
