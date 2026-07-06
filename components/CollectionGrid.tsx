'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────

export type CollectionTab = 'all' | 'retail-pieces' | 'trade-pieces' | 'limited-edition'

interface RawProduct {
  id: string
  name: string
  slug: string
  images: string[]
  short_description?: string
  retail_price?: number
  trade_price?: number
  price_type: string
  currency?: string
  audience: string
  is_fba_collection: boolean
  artisan?: { id: string; name: string; slug: string }
  category?: { id: string; name: string; slug: string }
  subcategory?: { id: string; name: string; slug: string }
}

interface FilterOptions {
  artisans:   { id: string; name: string; slug: string }[]
  materials:  string[]
  priceRange: { min: number; max: number }
}

interface CollectionGridProps {
  isTradeUser: boolean
}

// ─── Helpers ─────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' }

function formatPrice(amount: number, currency = 'GBP') {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency
  return `${sym}${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function resolveDisplayPrice(p: RawProduct, isTradeUser: boolean): string | null {
  if (p.price_type === 'price_on_request') return null
  const amount = isTradeUser ? (p.trade_price ?? p.retail_price) : p.retail_price
  if (amount == null) return null
  return formatPrice(amount, p.currency)
}

const ALL_TABS: { id: CollectionTab; label: string; locked?: boolean }[] = [
  { id: 'all',              label: 'All Pieces' },
  { id: 'retail-pieces',   label: 'Retail Pieces' },
  { id: 'trade-pieces',    label: 'Trade Pieces', locked: true },
  { id: 'limited-edition', label: 'Full Bloom Exclusives' },
]

// ─── Component ───────────────────────────────────────────────

export function CollectionGrid({ isTradeUser }: CollectionGridProps) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  // State — initialised from URL params so direct links work
  const [tab,         setTab]         = useState<CollectionTab>(
    (searchParams.get('tab') as CollectionTab) ?? 'all'
  )
  const [artisanId,   setArtisanId]   = useState(searchParams.get('artisan')   ?? '')
  const [material,    setMaterial]    = useState(searchParams.get('material')  ?? '')
  const [minPrice,    setMinPrice]    = useState(searchParams.get('min_price') ?? '')
  const [maxPrice,    setMaxPrice]    = useState(searchParams.get('max_price') ?? '')
  const [minInput,    setMinInput]    = useState(searchParams.get('min_price') ?? '')
  const [maxInput,    setMaxInput]    = useState(searchParams.get('max_price') ?? '')

  const [products,      setProducts]      = useState<RawProduct[]>([])
  const [loading,       setLoading]       = useState(true)
  const [fetchError,    setFetchError]    = useState(false)
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    artisans: [], materials: [], priceRange: { min: 0, max: 10000 },
  })

  // Fetch filter options once
  useEffect(() => {
    fetch('/api/products/filters?collection=true')
      .then(r => r.json())
      .then(data => setFilterOptions(data))
      .catch(() => {})
  }, [])

  // Fetch products when filters change
  const fetchProducts = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams()
    qs.set('collection', 'true')
    if (tab !== 'all')  qs.set('subcategory', tab)
    if (artisanId)      qs.set('artisan',     artisanId)
    if (material)       qs.set('material',    material)
    if (minPrice)       qs.set('min_price',   minPrice)
    if (maxPrice)       qs.set('max_price',   maxPrice)
    qs.set('limit', '60')

    try {
      const res  = await fetch(`/api/products?${qs}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setProducts(data.data ?? [])
      setFetchError(false)
    } catch {
      setProducts([])
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [tab, artisanId, material, minPrice, maxPrice])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  // Sync state → URL
  useEffect(() => {
    const qs = new URLSearchParams()
    if (tab !== 'all')  qs.set('tab',       tab)
    if (artisanId)      qs.set('artisan',   artisanId)
    if (material)       qs.set('material',  material)
    if (minPrice)       qs.set('min_price', minPrice)
    if (maxPrice)       qs.set('max_price', maxPrice)
    router.replace(`${pathname}${qs.toString() ? `?${qs}` : ''}`, { scroll: false })
  }, [tab, artisanId, material, minPrice, maxPrice, pathname, router])

  const clearFilters = () => {
    setArtisanId(''); setMaterial('')
    setMinPrice('');  setMaxPrice('')
    setMinInput('');  setMaxInput('')
  }

  const hasActiveFilters = !!(artisanId || material || minPrice || maxPrice)
  const tradeLocked = tab === 'trade-pieces' && !isTradeUser

  // ── Render ────────────────────────────────────────────────

  return (
    <div>
      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 32,
        padding: '4px', background: 'var(--sage-light)', width: 'fit-content', maxWidth: '100%',
      }}>
        {ALL_TABS.map(t => {
          const locked   = t.locked && !isTradeUser
          const isActive = t.id === tab
          return (
            <button
              key={t.id}
              onClick={() => !locked && setTab(t.id)}
              style={{
                padding: '10px 20px',
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-body)',
                cursor: locked ? 'default' : 'pointer',
                border: 'none',
                transition: 'all 0.2s ease',
                background: isActive ? 'var(--forest)' : 'transparent',
                color: locked ? 'var(--stone)' : isActive ? 'var(--cream)' : 'var(--forest)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {t.label}
              {locked && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Filter bar ──────────────────────────────────────── */}
      {(filterOptions.artisans.length > 0 || filterOptions.materials.length > 0) && (
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end',
          marginBottom: 40, padding: '20px 24px',
          background: 'var(--warm-white)', border: '1px solid var(--light-line)',
        }}>

          {/* Artisan / Studio */}
          {filterOptions.artisans.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 6 }}>
                Artisan / Studio
              </div>
              <select
                className="form-input"
                value={artisanId}
                onChange={e => setArtisanId(e.target.value)}
                style={{ fontSize: 12, padding: '7px 10px', minWidth: 160 }}
              >
                <option value="">All makers</option>
                {filterOptions.artisans.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Material */}
          {filterOptions.materials.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 6 }}>
                Material
              </div>
              <select
                className="form-input"
                value={material}
                onChange={e => setMaterial(e.target.value)}
                style={{ fontSize: 12, padding: '7px 10px', minWidth: 140 }}
              >
                <option value="">All materials</option>
                {filterOptions.materials.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {/* Price range */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 6 }}>
              Price range
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                className="form-input"
                placeholder={`£${filterOptions.priceRange.min}`}
                value={minInput}
                onChange={e => setMinInput(e.target.value)}
                onBlur={() => setMinPrice(minInput)}
                min={0}
                style={{ fontSize: 12, padding: '7px 8px', width: 76 }}
              />
              <span style={{ fontSize: 11, color: 'var(--stone)' }}>–</span>
              <input
                type="number"
                className="form-input"
                placeholder={`£${filterOptions.priceRange.max}`}
                value={maxInput}
                onChange={e => setMaxInput(e.target.value)}
                onBlur={() => setMaxPrice(maxInput)}
                min={0}
                style={{ fontSize: 12, padding: '7px 8px', width: 76 }}
              />
            </div>
          </div>

          {/* Clear */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="btn btn-ghost btn-sm"
              style={{ alignSelf: 'flex-end' }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────── */}

      {tradeLocked ? (
        <div style={{
          textAlign: 'center', padding: 'clamp(60px, 8vw, 96px) 0',
          border: '1px solid var(--light-line)', background: 'var(--warm-white)',
        }}>
          <div style={{
            width: 48, height: 48, margin: '0 auto 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--sage-light)', borderRadius: '50%',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 300, color: 'var(--forest)', marginBottom: 12 }}>
            Trade access required
          </h3>
          <p style={{ fontSize: 14, color: 'var(--stone)', maxWidth: 400, margin: '0 auto 28px', lineHeight: 1.7 }}>
            These pieces are available exclusively to approved trade clients.
            Apply for a trade account to unlock full pricing and availability.
          </p>
          <Link href="/trade/apply" className="btn btn-primary">Apply for Trade Access</Link>
        </div>

      ) : loading ? (
        <div className="grid-4" aria-busy="true" aria-label="Loading collection">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="product-card" aria-hidden>
              <div className="product-card-image" style={{ background: 'var(--sage-light, #e8ece5)', animation: 'fbaPulse 1.4s ease-in-out infinite' }} />
              <div className="product-card-meta">
                <div style={{ height: 12, width: '70%', background: 'var(--sage-light, #e8ece5)', animation: 'fbaPulse 1.4s ease-in-out infinite' }} />
              </div>
            </div>
          ))}
          <style>{`@keyframes fbaPulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.45 } }`}</style>
        </div>

      ) : fetchError ? (
        <div style={{ textAlign: 'center', padding: 'clamp(60px, 8vw, 96px) 0' }}>
          <p style={{ color: 'var(--stone)', fontSize: 15, marginBottom: 24 }}>The collection could not be loaded.</p>
          <button className="btn btn-primary btn-sm" onClick={() => fetchProducts()}>Retry</button>
        </div>

      ) : products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'clamp(60px, 8vw, 96px) 0' }}>
          <p style={{ color: 'var(--stone)', fontSize: 15, marginBottom: 24 }}>
            {hasActiveFilters ? 'No pieces match the selected filters.' : 'The collection is being updated. Check back soon.'}
          </p>
          {(tab !== 'all' || hasActiveFilters) && (
            <button className="btn btn-secondary" onClick={() => { setTab('all'); clearFilters() }}>
              View all pieces
            </button>
          )}
        </div>

      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 'clamp(20px, 3vw, 36px)',
        }}>
          {products.map(p => {
            const priceLabel   = resolveDisplayPrice(p, isTradeUser)
            const img          = p.images?.[0]
            const isExclusive  = p.subcategory?.slug === 'limited-edition'

            return (
              <Link key={p.id} href={`/products/${p.slug}`} style={{ textDecoration: 'none' }}>
                <article className="hover-lift" style={{ cursor: 'pointer' }}>
                  {/* Image */}
                  <div className="img-zoom-wrap" style={{
                    aspectRatio: '3/4', position: 'relative',
                    background: 'var(--sage-light)', marginBottom: 18, overflow: 'hidden',
                  }}>
                    {img ? (
                      <Image src={img} alt={p.name} fill style={{ objectFit: 'cover' }}
                        sizes="(max-width: 768px) 100vw, 33vw" />
                    ) : (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 11, color: 'var(--stone)', letterSpacing: '0.15em' }}>FBA</span>
                      </div>
                    )}

                    {/* Badge */}
                    <div style={{
                      position: 'absolute', top: 12, left: 12,
                      background: isExclusive ? 'var(--caramel)' : 'var(--forest)',
                      color: 'var(--cream)', fontSize: 9, fontWeight: 600,
                      letterSpacing: '0.2em', textTransform: 'uppercase',
                      padding: '5px 10px', zIndex: 2,
                    }}>
                      {isExclusive ? 'Full Bloom Exclusive' : 'FBA Collection'}
                    </div>

                    {/* Subcategory tag */}
                    {p.subcategory?.name && p.subcategory.name !== 'FBA Collection' && (
                      <div style={{
                        position: 'absolute', bottom: 12, right: 12,
                        background: 'rgba(247,243,238,0.92)',
                        fontSize: 9, fontWeight: 500, letterSpacing: '0.16em',
                        textTransform: 'uppercase', color: 'var(--forest)',
                        padding: '4px 8px', zIndex: 2,
                      }}>
                        {p.subcategory.name}
                      </div>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="label label-sage" style={{ marginBottom: 6 }}>
                    {p.category?.name ?? ''}
                  </div>
                  <h3 style={{
                    fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 300,
                    color: 'var(--forest)', marginBottom: 4, lineHeight: 1.25,
                  }}>
                    {p.name}
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 10 }}>
                    by {p.artisan?.name ?? 'Unknown maker'}
                  </p>
                  {p.short_description && (
                    <p style={{ fontSize: 13, color: 'var(--stone)', lineHeight: 1.65, marginBottom: 10 }}>
                      {p.short_description.slice(0, 90)}{p.short_description.length > 90 ? '…' : ''}
                    </p>
                  )}
                  <p style={{
                    fontSize: 14,
                    color: priceLabel ? 'var(--caramel)' : 'var(--stone)',
                    fontWeight: 500,
                  }}>
                    {priceLabel ?? 'Price on request'}
                  </p>
                </article>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
