'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ProductCard } from '@/components/ProductCard'
import { QuickView } from '@/components/QuickView'
import { ProjectSaveModal } from '@/components/ProjectSaveModal'
import { TheEditHero } from '@/components/TheEditHero'
import { TheEditFilterBar } from '@/components/TheEditFilterBar'
import { TheEditSidebar } from '@/components/TheEditSidebar'
import { TheEditActiveFilters } from '@/components/TheEditActiveFilters'
import { TheEditToolbar } from '@/components/TheEditToolbar'
import type { Product, Category, SessionUser, HeroImageSetting } from '@/lib/types'

interface FilterOptions {
  artisans:    { id: string; name: string; slug: string }[]
  materials:   string[]
  finishTypes: string[]
  regions:     string[]
  priceRange:  { min: number; max: number }
  leadTimeMax: number
}

interface Props {
  session:       SessionUser | null
  categories:    Category[]
  heroImage:     HeroImageSetting
  initialFilters: {
    category?:      string
    subcategory?:   string
    q?:             string
    page:           number
    artisan?:       string
    material?:      string
    minPrice?:      string
    maxPrice?:      string
    audience?:      string
    sort?:          string
    fireRetardant?: string
    stainProofed?:  string
    rubCount40k?:   string
    maxLeadTime?:   string
    finishType?:    string
    region?:        string
  }
}

export function ProductsClient({ session, categories, heroImage, initialFilters }: Props) {
  const router   = useRouter()
  const pathname = usePathname()

  const [products,      setProducts]      = useState<Product[]>([])
  const [meta,          setMeta]          = useState({ total: 0, pages: 1, page: 1 })
  const [loading,       setLoading]       = useState(true)
  const [quickView,     setQuickView]     = useState<Product | null>(null)
  const [saveProduct,   setSaveProduct]   = useState<Product | null>(null)
  const [searchInput,   setSearchInput]   = useState(initialFilters.q ?? '')
  const [minPriceInput, setMinPriceInput] = useState(initialFilters.minPrice ?? '')
  const [maxPriceInput, setMaxPriceInput] = useState(initialFilters.maxPrice ?? '')
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    artisans: [], materials: [], finishTypes: [], regions: [],
    priceRange: { min: 0, max: 10000 }, leadTimeMax: 24,
  })

  const [filters, setFilters] = useState({
    category:      initialFilters.category      ?? '',
    subcategory:   initialFilters.subcategory   ?? '',
    q:             initialFilters.q             ?? '',
    artisan:       initialFilters.artisan        ?? '',
    material:      initialFilters.material       ?? '',
    minPrice:      initialFilters.minPrice       ?? '',
    maxPrice:      initialFilters.maxPrice       ?? '',
    audience:      initialFilters.audience       ?? '',
    sort:          initialFilters.sort           ?? 'featured',
    fireRetardant: initialFilters.fireRetardant === 'true',
    stainProofed:  initialFilters.stainProofed  === 'true',
    rubCount40k:   initialFilters.rubCount40k   === 'true',
    maxLeadTime:   initialFilters.maxLeadTime    ?? '',
    finishType:    initialFilters.finishType     ?? '',
    region:        initialFilters.region         ?? '',
    page:          initialFilters.page,
  })

  useEffect(() => {
    fetch('/api/products/filters')
      .then(r => r.json())
      .then(data => setFilterOptions(data))
      .catch(() => {})
  }, [])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (filters.category)                qs.set('category',        filters.category)
    if (filters.subcategory)             qs.set('subcategory',     filters.subcategory)
    if (filters.q)                       qs.set('q',               filters.q)
    if (filters.artisan)                 qs.set('artisan',         filters.artisan)
    if (filters.material)                qs.set('material',        filters.material)
    if (filters.minPrice)                qs.set('min_price',       filters.minPrice)
    if (filters.maxPrice)                qs.set('max_price',       filters.maxPrice)
    if (filters.audience)                qs.set('audience',        filters.audience)
    if (filters.sort && filters.sort !== 'featured') qs.set('sort', filters.sort)
    if (filters.fireRetardant)           qs.set('fire_retardant',  'true')
    if (filters.stainProofed)            qs.set('stain_proofed',   'true')
    if (filters.rubCount40k)             qs.set('rub_count_40k',   'true')
    if (filters.maxLeadTime)             qs.set('max_lead_time',   filters.maxLeadTime)
    if (filters.finishType)              qs.set('finish_type',     filters.finishType)
    if (filters.region)                  qs.set('region',          filters.region)
    qs.set('page',  String(filters.page))
    qs.set('limit', '24')

    const res  = await fetch('/api/products?' + qs)
    const data = await res.json()
    setProducts(data.data ?? [])
    setMeta(data.meta ?? { total: 0, pages: 1, page: 1 })
    setLoading(false)
  }, [filters])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  // Sync filters → URL
  useEffect(() => {
    const qs = new URLSearchParams()
    if (filters.category)    qs.set('category',       filters.category)
    if (filters.subcategory) qs.set('subcategory',    filters.subcategory)
    if (filters.q)           qs.set('q',              filters.q)
    if (filters.artisan)     qs.set('artisan',        filters.artisan)
    if (filters.material)    qs.set('material',       filters.material)
    if (filters.minPrice)    qs.set('min_price',      filters.minPrice)
    if (filters.maxPrice)    qs.set('max_price',      filters.maxPrice)
    if (filters.audience)    qs.set('audience',       filters.audience)
    if (filters.sort && filters.sort !== 'featured') qs.set('sort', filters.sort)
    if (filters.fireRetardant) qs.set('fire_retardant', 'true')
    if (filters.stainProofed)  qs.set('stain_proofed',  'true')
    if (filters.rubCount40k)   qs.set('rub_count_40k',  'true')
    if (filters.maxLeadTime)   qs.set('max_lead_time',  filters.maxLeadTime)
    if (filters.finishType)    qs.set('finish_type',    filters.finishType)
    if (filters.region)        qs.set('region',         filters.region)
    if (filters.page > 1)      qs.set('page',           String(filters.page))
    router.replace(pathname + (qs.toString() ? '?' + qs : ''), { scroll: false })
  }, [filters, pathname, router])

  const setFilter = (key: keyof typeof filters, value: string | boolean | number) =>
    setFilters(f => ({ ...f, [key]: value, page: 1 }))

  const clearAllFilters = () => {
    setFilters({
      category: '', subcategory: '', q: '', artisan: '', material: '',
      minPrice: '', maxPrice: '', audience: '', sort: 'featured',
      fireRetardant: false, stainProofed: false, rubCount40k: false,
      maxLeadTime: '', finishType: '', region: '', page: 1,
    })
    setSearchInput('')
    setMinPriceInput('')
    setMaxPriceInput('')
  }

  const handlePriceBlur = () => {
    setFilter('minPrice', minPriceInput)
    setFilter('maxPrice', maxPriceInput)
  }

  // Build active filter chips for the chip strip
  const chips: { label: string; onRemove: () => void }[] = []
  if (filters.fireRetardant) chips.push({ label: 'Fire Retardant',     onRemove: () => setFilter('fireRetardant', false) })
  if (filters.stainProofed)  chips.push({ label: 'Stain Proofed',      onRemove: () => setFilter('stainProofed',  false) })
  if (filters.rubCount40k)   chips.push({ label: 'Rub Count 40,000+',  onRemove: () => setFilter('rubCount40k',   false) })
  if (filters.maxLeadTime)   chips.push({ label: `Lead ≤ ${filters.maxLeadTime} wks`, onRemove: () => setFilter('maxLeadTime', '') })
  if (filters.finishType)    chips.push({ label: `Finish: ${filters.finishType}`,     onRemove: () => setFilter('finishType',  '') })
  if (filters.region)        chips.push({ label: `Region: ${filters.region}`,         onRemove: () => setFilter('region',      '') })
  if (filters.artisan) {
    const a = filterOptions.artisans.find(x => x.id === filters.artisan)
    if (a) chips.push({ label: a.name, onRemove: () => setFilter('artisan', '') })
  }
  if (filters.minPrice || filters.maxPrice) {
    const label = filters.minPrice && filters.maxPrice
      ? `£${filters.minPrice}–£${filters.maxPrice}`
      : filters.maxPrice ? `Max £${filters.maxPrice}` : `Min £${filters.minPrice}`
    chips.push({ label, onRemove: () => { setFilter('minPrice', ''); setFilter('maxPrice', ''); setMinPriceInput(''); setMaxPriceInput('') } })
  }
  if (filters.q) chips.push({ label: `"${filters.q}"`, onRemove: () => { setFilter('q', ''); setSearchInput('') } })

  const sidebarFilters = {
    fireRetardant: filters.fireRetardant,
    stainProofed:  filters.stainProofed,
    rubCount40k:   filters.rubCount40k,
    maxLeadTime:   filters.maxLeadTime,
    finishType:    filters.finishType,
    region:        filters.region,
    minPrice:      filters.minPrice,
    maxPrice:      filters.maxPrice,
    artisan:       filters.artisan,
    material:      filters.material,
    audience:      filters.audience,
  }

  return (
    <>
      {/* Hero + Category tabs */}
      <TheEditHero
        categories={categories}
        heroImage={heroImage}
        activeCategory={filters.category}
        onCategory={slug => { setFilter('category', slug); setFilter('subcategory', '') }}
      />

      {/* Subcategory filter bar */}
      <TheEditFilterBar
        categories={categories}
        activeCategory={filters.category}
        activeSubcategory={filters.subcategory}
        onSubcategory={slug => setFilter('subcategory', slug)}
      />

      {/* Main content */}
      <div style={{ padding: '40px 48px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', gap: 48 }}>

          {/* Sidebar */}
          <TheEditSidebar
            session={session}
            filterOptions={filterOptions}
            filters={sidebarFilters}
            onFilter={(key, value) => setFilter(key as keyof typeof filters, value)}
            minPriceInput={minPriceInput}
            maxPriceInput={maxPriceInput}
            onMinPriceInput={setMinPriceInput}
            onMaxPriceInput={setMaxPriceInput}
            onPriceBlur={handlePriceBlur}
          />

          {/* Product area */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Active filter chips */}
            <TheEditActiveFilters chips={chips} onClearAll={clearAllFilters} />

            {/* Toolbar: count + search + sort */}
            <TheEditToolbar
              total={meta.total}
              loading={loading}
              sort={filters.sort}
              onSort={v => setFilter('sort', v)}
              searchInput={searchInput}
              onSearchInput={setSearchInput}
              onSearchSubmit={() => setFilter('q', searchInput)}
            />

            {/* Grid */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--stone)' }}>
                Loading…
              </div>
            ) : products.length === 0 ? (
              <div className="empty-state">
                <h3>No pieces match your filters</h3>
                <p>Try adjusting the Technical Passport criteria or browse all categories.</p>
                {chips.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={clearAllFilters} style={{ marginTop: 16 }}>
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid-4">
                {products.map(p => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    session={session}
                    onQuickView={setQuickView}
                    onSaveToProject={setSaveProduct}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {meta.pages > 1 && (
              <div className="pagination">
                {Array.from({ length: meta.pages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    className={'page-btn' + (meta.page === p ? ' active' : '')}
                    onClick={() => setFilters(f => ({ ...f, page: p }))}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>

      {quickView && (
        <QuickView
          product={quickView}
          session={session}
          onClose={() => setQuickView(null)}
          onSaveToProject={p => { setQuickView(null); setSaveProduct(p) }}
        />
      )}

      {saveProduct && (
        <ProjectSaveModal
          product={saveProduct}
          session={session}
          onClose={() => setSaveProduct(null)}
        />
      )}
    </>
  )
}
