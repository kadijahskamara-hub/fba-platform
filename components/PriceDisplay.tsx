import { resolvePrice } from '@/lib/pricing'
import type { Product, SessionUser } from '@/lib/types'

interface PriceDisplayProps {
  product: Product
  session: SessionUser | null
  size?: 'sm' | 'md' | 'lg'
  showTradeLabel?: boolean
}

export function PriceDisplay({ product, session, size = 'md', showTradeLabel = false }: PriceDisplayProps) {
  const price = resolvePrice(product, session)
  const isTrade = session?.role === 'trade_user' || session?.role === 'admin'

  const fontSizes = { sm: 13, md: 16, lg: 22 }
  const fs = fontSizes[size]

  if (price.type === 'request') {
    return (
      <span style={{ fontStyle: 'italic', fontSize: fs, color: 'var(--stone)' }}>
        Price on request
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: fs, fontWeight: 500, color: isTrade ? 'var(--caramel)' : 'var(--forest)' }}>
        {price.label}
      </span>
      {showTradeLabel && isTrade && (
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
          background: 'var(--sand)', color: 'var(--forest)', padding: '2px 8px' }}>
          Trade
        </span>
      )}
    </span>
  )
}
