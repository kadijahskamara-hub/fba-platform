import type { Product, SessionUser, PriceDisplay, CurrencyCode } from './types'

// ── Currency formatting ──────────────────────────────────────

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  GBP: '£',
  EUR: '€',
  USD: '$',
}

export function formatPrice(amount: number, currency: CurrencyCode = 'GBP'): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency
  return `${sym}${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// ── Role-based price resolution ──────────────────────────────
//
// | User role              | Price shown                         |
// |------------------------|--------------------------------------|
// | Guest                  | Retail price or "Price on request"  |
// | retail_customer        | Retail price                        |
// | trade_applicant        | Retail price                        |
// | trade_user             | Trade price                         |
// | admin                  | Trade price + full cost visibility  |
// | Product: price_on_req  | "Price on request" regardless       |

export function resolvePrice(
  product: Pick<Product, 'retailPrice' | 'tradePrice' | 'priceType' | 'currency'>,
  session: SessionUser | null
): PriceDisplay {
  const { retailPrice, tradePrice, priceType, currency } = product

  if (priceType === 'price_on_request') {
    return { type: 'request', label: 'Price on request' }
  }

  const role = session?.role ?? 'guest'

  if (role === 'trade_user' || role === 'admin') {
    const price = tradePrice ?? retailPrice
    if (price == null) return { type: 'request', label: 'Price on request' }
    return {
      type: 'fixed',
      amount: price,
      currency: currency as CurrencyCode,
      label: formatPrice(price, currency as CurrencyCode),
    }
  }

  // Guest, retail_customer, trade_applicant
  if (retailPrice == null) return { type: 'request', label: 'Price on request' }
  return {
    type: 'fixed',
    amount: retailPrice,
    currency: currency as CurrencyCode,
    label: formatPrice(retailPrice, currency as CurrencyCode),
  }
}

// ── Can user see trade price? ────────────────────────────────

export function canSeeTradePricing(session: SessionUser | null): boolean {
  return session?.role === 'trade_user' || session?.role === 'admin'
}

// ── Product visible to user? ─────────────────────────────────

export function isProductVisibleTo(
  product: Pick<Product, 'visibility' | 'audience'>,
  session: SessionUser | null
): boolean {
  if (product.visibility !== 'published') {
    // Only admins see non-published
    return session?.role === 'admin'
  }

  const role = session?.role ?? 'guest'
  const { audience } = product

  if (audience === 'retail_and_trade') return true
  if (audience === 'retail') return role !== 'trade_user'
  if (audience === 'trade') return role === 'trade_user' || role === 'admin'

  return true
}
