'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type FormData = {
  // ── Core product ──────────────────────────────────────────
  name: string; slug: string; sku: string; referenceCode: string
  categoryId: string; subcategoryId: string; subcategoryName: string; artisanId: string
  description: string; shortDescription: string
  retailPrice: string; tradePrice: string; supplierCost: string
  priceType: 'fixed' | 'price_on_request'
  currency: 'GBP' | 'EUR' | 'USD'
  visibility: 'draft' | 'published'
  audience: 'retail' | 'trade' | 'retail_and_trade'
  isFbaCollection: boolean
  isFbaHome: boolean
  leadTime: string; shippingOrigin: string; shippingNotes: string
  images: string
  seoTitle: string; seoDescription: string

  // ── Dimensions & base specs ───────────────────────────────
  material: string; finish: string; fabric: string
  widthMm: string; depthMm: string; heightMm: string
  seatHeightMm: string; diameterMm: string; weightKg: string
  comAvailable: boolean; careInstructions: string; technicalNotes: string

  // ── Lighting (existing) ───────────────────────────────────
  bulbType: string; wattage: string; voltage: string
  plugType: string; cableLength: string; dimmable: boolean; ipRating: string

  // ── Generic material config (seating / accessories) ───────
  frameMaterial: string; frameMaterialOptions: string; frameFinishColourOptions: string
  armrestMaterial: string; armrestFinishColourOptions: string
  seatMaterial: string; backMaterial: string; seatBackUpholsteryOptions: string
  upholsteredLegsColourOptions: string
  glides: string; stackable: boolean; indoorOutdoorUse: string
  footprintM2: string; shippingVolumeM3: string
  otherAvailableOptions: string

  // ── Table-specific config ─────────────────────────────────
  legMaterial: string; legMaterialOptions: string; legFinishColourOptions: string
  topMaterial: string; topMaterialOptions: string; topThicknessMm: string
  topFinishColourOptions: string; topShapeOptions: string; topSizeOptions: string
  basePedestalType: string; feetGlides: string
  suitableTableTopSizes: string; extensionOptions: string

  // ── Extended lighting config ──────────────────────────────
  bodyFrameMaterial: string; baseMaterial: string
  diffuserShadeMaterial: string; fringesTrimMaterial: string
  bodyFrameColourOptions: string; baseColourOptions: string
  diffuserShadeColourOptions: string; fringesColourOptions: string
  suitableFor: string; rechargeable: boolean; batteryLife: string
  lightSourceType: string; recommendedLightSource: string; lumens: string
  colourTemperature: string; averageLifeLightSource: string
  sparePartsAvailable: string; lightingSpecNotes: string
}

const EMPTY: FormData = {
  name: '', slug: '', sku: '', referenceCode: '',
  categoryId: '', subcategoryId: '', subcategoryName: '', artisanId: '',
  description: '', shortDescription: '',
  retailPrice: '', tradePrice: '', supplierCost: '',
  priceType: 'fixed', currency: 'GBP',
  visibility: 'draft', audience: 'retail_and_trade',
  isFbaCollection: false, isFbaHome: false,
  leadTime: '', shippingOrigin: '', shippingNotes: '',
  images: '',
  seoTitle: '', seoDescription: '',
  material: '', finish: '', fabric: '',
  widthMm: '', depthMm: '', heightMm: '',
  seatHeightMm: '', diameterMm: '', weightKg: '',
  comAvailable: false, careInstructions: '', technicalNotes: '',
  bulbType: '', wattage: '', voltage: '',
  plugType: '', cableLength: '', dimmable: false, ipRating: '',
  // generic material config
  frameMaterial: '', frameMaterialOptions: '', frameFinishColourOptions: '',
  armrestMaterial: '', armrestFinishColourOptions: '',
  seatMaterial: '', backMaterial: '', seatBackUpholsteryOptions: '',
  upholsteredLegsColourOptions: '',
  glides: '', stackable: false, indoorOutdoorUse: '',
  footprintM2: '', shippingVolumeM3: '',
  otherAvailableOptions: '',
  // table-specific
  legMaterial: '', legMaterialOptions: '', legFinishColourOptions: '',
  topMaterial: '', topMaterialOptions: '', topThicknessMm: '',
  topFinishColourOptions: '', topShapeOptions: '', topSizeOptions: '',
  basePedestalType: '', feetGlides: '',
  suitableTableTopSizes: '', extensionOptions: '',
  // extended lighting
  bodyFrameMaterial: '', baseMaterial: '',
  diffuserShadeMaterial: '', fringesTrimMaterial: '',
  bodyFrameColourOptions: '', baseColourOptions: '',
  diffuserShadeColourOptions: '', fringesColourOptions: '',
  suitableFor: '', rechargeable: false, batteryLife: '',
  lightSourceType: '', recommendedLightSource: '', lumens: '',
  colourTemperature: '', averageLifeLightSource: '',
  sparePartsAvailable: '', lightingSpecNotes: '',
}

type Category = { id: string; name: string; slug: string; subcategories?: { id: string; name: string }[] }
type Artisan  = { id: string; name: string }

interface Props {
  mode: 'create' | 'edit'
  product?: Record<string, unknown>
  categories?: Category[]
  artisans?:   Artisan[]
}

function productToForm(p: Record<string, unknown>, spec: Record<string, unknown> | null): FormData {
  const images = Array.isArray(p.images) ? (p.images as string[]).join('\n') : ''
  const s = spec ?? {}
  return {
    name:             String(p.name ?? ''),
    slug:             String(p.slug ?? ''),
    sku:              String(p.sku ?? ''),
    referenceCode:    String(p.reference_code ?? ''),
    categoryId:       String(p.category_id ?? ''),
    subcategoryId:    String(p.subcategory_id ?? ''),
    subcategoryName:  '',
    artisanId:        String(p.artisan_id ?? ''),
    description:      String(p.description ?? ''),
    shortDescription: String(p.short_description ?? ''),
    retailPrice:      p.retail_price != null ? String(p.retail_price) : '',
    tradePrice:       p.trade_price  != null ? String(p.trade_price)  : '',
    supplierCost:     p.supplier_cost != null ? String(p.supplier_cost) : '',
    priceType:        (p.price_type as FormData['priceType']) ?? 'fixed',
    currency:         (p.currency as FormData['currency']) ?? 'GBP',
    visibility:       (p.visibility === 'published' ? 'published' : 'draft'),
    audience:         (p.audience as FormData['audience']) ?? 'retail_and_trade',
    isFbaCollection:  Boolean(p.is_fba_collection),
    isFbaHome:        Boolean(p.is_fba_home),
    leadTime:         String(p.lead_time ?? ''),
    shippingOrigin:   String(p.shipping_origin ?? ''),
    shippingNotes:    String(p.shipping_notes ?? ''),
    images,
    seoTitle:         String(p.seo_title ?? ''),
    seoDescription:   String(p.seo_description ?? ''),
    // base spec
    material:         String(s.material ?? ''),
    finish:           String(s.finish ?? ''),
    fabric:           String(s.fabric ?? ''),
    widthMm:          s.width_mm  != null ? String(s.width_mm)  : '',
    depthMm:          s.depth_mm  != null ? String(s.depth_mm)  : '',
    heightMm:         s.height_mm != null ? String(s.height_mm) : '',
    seatHeightMm:     s.seat_height_mm != null ? String(s.seat_height_mm) : '',
    diameterMm:       s.diameter_mm    != null ? String(s.diameter_mm)    : '',
    weightKg:         s.weight_kg      != null ? String(s.weight_kg)      : '',
    comAvailable:     Boolean(s.com_available),
    careInstructions: String(s.care_instructions ?? ''),
    technicalNotes:   String(s.technical_notes ?? ''),
    // existing lighting
    bulbType:    String(s.bulb_type ?? ''), wattage: String(s.wattage ?? ''),
    voltage:     String(s.voltage ?? ''),   plugType: String(s.plug_type ?? ''),
    cableLength: String(s.cable_length ?? ''), dimmable: Boolean(s.dimmable),
    ipRating:    String(s.ip_rating ?? ''),
    // generic material config
    frameMaterial:              String(s.frame_material ?? ''),
    frameMaterialOptions:       String(s.frame_material_options ?? ''),
    frameFinishColourOptions:   String(s.frame_finish_colour_options ?? ''),
    armrestMaterial:            String(s.armrest_material ?? ''),
    armrestFinishColourOptions: String(s.armrest_finish_colour_options ?? ''),
    seatMaterial:               String(s.seat_material ?? ''),
    backMaterial:               String(s.back_material ?? ''),
    seatBackUpholsteryOptions:  String(s.seat_back_upholstery_options ?? ''),
    upholsteredLegsColourOptions: String(s.upholstered_legs_colour_options ?? ''),
    glides:                     String(s.glides ?? ''),
    stackable:                  Boolean(s.stackable),
    indoorOutdoorUse:           String(s.indoor_outdoor_use ?? ''),
    footprintM2:                s.footprint_m2      != null ? String(s.footprint_m2)      : '',
    shippingVolumeM3:           s.shipping_volume_m3 != null ? String(s.shipping_volume_m3) : '',
    otherAvailableOptions:      String(s.other_available_options ?? ''),
    // table-specific
    legMaterial:            String(s.leg_material ?? ''),
    legMaterialOptions:     String(s.leg_material_options ?? ''),
    legFinishColourOptions: String(s.leg_finish_colour_options ?? ''),
    topMaterial:            String(s.top_material ?? ''),
    topMaterialOptions:     String(s.top_material_options ?? ''),
    topThicknessMm:         s.top_thickness_mm != null ? String(s.top_thickness_mm) : '',
    topFinishColourOptions: String(s.top_finish_colour_options ?? ''),
    topShapeOptions:        String(s.top_shape_options ?? ''),
    topSizeOptions:         String(s.top_size_options ?? ''),
    basePedestalType:       String(s.base_pedestal_type ?? ''),
    feetGlides:             String(s.feet_glides ?? ''),
    suitableTableTopSizes:  String(s.suitable_table_top_sizes ?? ''),
    extensionOptions:       String(s.extension_options ?? ''),
    // extended lighting
    bodyFrameMaterial:          String(s.body_frame_material ?? ''),
    baseMaterial:               String(s.base_material ?? ''),
    diffuserShadeMaterial:      String(s.diffuser_shade_material ?? ''),
    fringesTrimMaterial:        String(s.fringes_trim_material ?? ''),
    bodyFrameColourOptions:     String(s.body_frame_colour_options ?? ''),
    baseColourOptions:          String(s.base_colour_options ?? ''),
    diffuserShadeColourOptions: String(s.diffuser_shade_colour_options ?? ''),
    fringesColourOptions:       String(s.fringes_colour_options ?? ''),
    suitableFor:                String(s.suitable_for ?? ''),
    rechargeable:               Boolean(s.rechargeable),
    batteryLife:                String(s.battery_life ?? ''),
    lightSourceType:            String(s.light_source_type ?? ''),
    recommendedLightSource:     String(s.recommended_light_source ?? ''),
    lumens:                     String(s.lumens ?? ''),
    colourTemperature:          String(s.colour_temperature ?? ''),
    averageLifeLightSource:     String(s.average_life_light_source ?? ''),
    sparePartsAvailable:        String(s.spare_parts_available ?? ''),
    lightingSpecNotes:          String(s.lighting_spec_notes ?? ''),
  }
}

export default function AdminProductForm({ mode, product, categories: initCats = [], artisans: initArtisans = [] }: Props) {
  const router = useRouter()
  const spec   = Array.isArray(product?.spec)
    ? (product.spec as Record<string, unknown>[])[0] ?? null
    : (product?.spec as Record<string, unknown> | null) ?? null

  const [form, setForm]             = useState<FormData>(product ? productToForm(product, spec) : EMPTY)
  const [categories, setCategories] = useState<Category[]>(initCats)
  const [artisans,   setArtisans]   = useState<Artisan[]>(initArtisans)
  const [error,      setError]      = useState('')
  const [activeTab,  setActiveTab]  = useState<'basic' | 'specs' | 'materials' | 'pricing' | 'seo'>('basic')
  const [isPending,  startTransition] = useTransition()

  useEffect(() => {
    if (!initCats.length)     fetch('/api/admin/categories').then(r => r.json()).then(d => setCategories(d.data ?? []))
    if (!initArtisans.length) fetch('/api/admin/artisans').then(r => r.json()).then(d => setArtisans(d.data ?? []))
  }, [initCats.length, initArtisans.length])

  const set = (key: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({
        ...f,
        [key]: (e.target as HTMLInputElement).type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : e.target.value,
      }))

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    setForm(f => ({ ...f, name, slug }))
  }

  const selectedCategory = categories.find(c => c.id === form.categoryId)
  const isLighting = selectedCategory?.slug === 'lighting'
  const isTables   = selectedCategory?.slug === 'tables'

  const buildSpecifications = () => ({
    // base
    material:         form.material || undefined,
    finish:           form.finish   || undefined,
    fabric:           form.fabric   || undefined,
    widthMm:          form.widthMm      ? parseFloat(form.widthMm)      : undefined,
    depthMm:          form.depthMm      ? parseFloat(form.depthMm)      : undefined,
    heightMm:         form.heightMm     ? parseFloat(form.heightMm)     : undefined,
    seatHeightMm:     form.seatHeightMm ? parseFloat(form.seatHeightMm) : undefined,
    diameterMm:       form.diameterMm   ? parseFloat(form.diameterMm)   : undefined,
    weightKg:         form.weightKg     ? parseFloat(form.weightKg)     : undefined,
    comAvailable:     form.comAvailable,
    careInstructions: form.careInstructions || undefined,
    technicalNotes:   form.technicalNotes   || undefined,
    // existing lighting
    bulbType:    form.bulbType    || undefined,
    wattage:     form.wattage     || undefined,
    voltage:     form.voltage     || undefined,
    plugType:    form.plugType    || undefined,
    cableLength: form.cableLength || undefined,
    dimmable:    form.dimmable,
    ipRating:    form.ipRating    || undefined,
    // generic material config
    frameMaterial:               form.frameMaterial              || undefined,
    frameMaterialOptions:        form.frameMaterialOptions       || undefined,
    frameFinishColourOptions:    form.frameFinishColourOptions   || undefined,
    armrestMaterial:             form.armrestMaterial            || undefined,
    armrestFinishColourOptions:  form.armrestFinishColourOptions || undefined,
    seatMaterial:                form.seatMaterial               || undefined,
    backMaterial:                form.backMaterial               || undefined,
    seatBackUpholsteryOptions:   form.seatBackUpholsteryOptions  || undefined,
    upholsteredLegsColourOptions:form.upholsteredLegsColourOptions || undefined,
    glides:                      form.glides                     || undefined,
    stackable:                   form.stackable,
    indoorOutdoorUse:            form.indoorOutdoorUse           || undefined,
    footprintM2:                 form.footprintM2     ? parseFloat(form.footprintM2)     : undefined,
    shippingVolumeM3:            form.shippingVolumeM3 ? parseFloat(form.shippingVolumeM3) : undefined,
    otherAvailableOptions:       form.otherAvailableOptions      || undefined,
    // table-specific
    legMaterial:           form.legMaterial           || undefined,
    legMaterialOptions:    form.legMaterialOptions    || undefined,
    legFinishColourOptions:form.legFinishColourOptions || undefined,
    topMaterial:           form.topMaterial           || undefined,
    topMaterialOptions:    form.topMaterialOptions    || undefined,
    topThicknessMm:        form.topThicknessMm ? parseFloat(form.topThicknessMm) : undefined,
    topFinishColourOptions:form.topFinishColourOptions || undefined,
    topShapeOptions:       form.topShapeOptions       || undefined,
    topSizeOptions:        form.topSizeOptions        || undefined,
    basePedestalType:      form.basePedestalType      || undefined,
    feetGlides:            form.feetGlides            || undefined,
    suitableTableTopSizes: form.suitableTableTopSizes || undefined,
    extensionOptions:      form.extensionOptions      || undefined,
    // extended lighting
    bodyFrameMaterial:          form.bodyFrameMaterial          || undefined,
    baseMaterial:               form.baseMaterial               || undefined,
    diffuserShadeMaterial:      form.diffuserShadeMaterial      || undefined,
    fringesTrimMaterial:        form.fringesTrimMaterial        || undefined,
    bodyFrameColourOptions:     form.bodyFrameColourOptions     || undefined,
    baseColourOptions:          form.baseColourOptions          || undefined,
    diffuserShadeColourOptions: form.diffuserShadeColourOptions || undefined,
    fringesColourOptions:       form.fringesColourOptions       || undefined,
    suitableFor:                form.suitableFor                || undefined,
    rechargeable:               form.rechargeable,
    batteryLife:                form.batteryLife                || undefined,
    lightSourceType:            form.lightSourceType            || undefined,
    recommendedLightSource:     form.recommendedLightSource     || undefined,
    lumens:                     form.lumens                     || undefined,
    colourTemperature:          form.colourTemperature          || undefined,
    averageLifeLightSource:     form.averageLifeLightSource     || undefined,
    sparePartsAvailable:        form.sparePartsAvailable        || undefined,
    lightingSpecNotes:          form.lightingSpecNotes          || undefined,
  })

  const buildPayload = () => ({
    name:             form.name,
    slug:             form.slug,
    sku:              form.sku           || undefined,
    referenceCode:    form.referenceCode || undefined,
    categoryId:       form.categoryId   || undefined,
    subcategoryId:    form.subcategoryId && form.subcategoryId !== '__new__' ? form.subcategoryId : undefined,
    subcategoryName:  form.subcategoryId === '__new__' && form.subcategoryName.trim() ? form.subcategoryName.trim() : undefined,
    artisanId:        form.artisanId    || undefined,
    description:      form.description,
    shortDescription: form.shortDescription || undefined,
    retailPrice:      form.priceType === 'fixed' && form.retailPrice ? parseFloat(form.retailPrice) : undefined,
    tradePrice:       form.priceType === 'fixed' && form.tradePrice  ? parseFloat(form.tradePrice)  : undefined,
    supplierCost:     form.supplierCost ? parseFloat(form.supplierCost) : undefined,
    priceType:        form.priceType,
    currency:         form.currency,
    visibility:       form.visibility,
    audience:         form.audience,
    isFbaCollection:  form.isFbaCollection,
    isFbaHome:        form.isFbaHome,
    leadTime:         form.leadTime       || undefined,
    shippingOrigin:   form.shippingOrigin || undefined,
    shippingNotes:    form.shippingNotes  || undefined,
    images:           form.images.split('\n').map(s => s.trim()).filter(Boolean),
    seoTitle:         form.seoTitle       || undefined,
    seoDescription:   form.seoDescription || undefined,
    specifications:   buildSpecifications(),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.slug || !form.description || !form.categoryId) {
      setError('Name, slug, description and category are required.')
      return
    }
    setError('')
    startTransition(async () => {
      const url    = mode === 'create' ? '/api/products' : `/api/products/${product!.slug}`
      const method = mode === 'create' ? 'POST' : 'PATCH'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload()) })
      const data   = await res.json()
      if (!data.success) { setError(data.error ?? 'Save failed.'); return }
      router.push('/admin/products')
      router.refresh()
    })
  }

  const tabs = [
    { id: 'basic',     label: 'Product Details' },
    { id: 'specs',     label: 'Specifications' },
    { id: 'materials', label: 'Material Config' },
    { id: 'pricing',   label: 'Pricing & Visibility' },
    { id: 'seo',       label: 'SEO' },
  ] as const

  // ── Reusable field helpers ───────────────────────────────────
  const textRow = (pairs: [keyof FormData, string][], placeholder?: string) => (
    <div className="form-row">
      {pairs.map(([key, label]) => (
        <div key={key} className="form-group">
          <label className="form-label">{label}</label>
          <input type="text" className="form-input" value={form[key] as string}
            onChange={set(key)} placeholder={placeholder} />
        </div>
      ))}
    </div>
  )

  const textAreaField = (key: keyof FormData, label: string, hint?: string, rows = 2) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <textarea className="form-textarea" rows={rows} value={form[key] as string} onChange={set(key)} />
      {hint && <p className="form-hint">{hint}</p>}
    </div>
  )

  const sectionDivider = (title: string) => (
    <>
      <hr style={{ margin: '28px 0', border: 'none', borderTop: '1px solid var(--light-line)' }} />
      <h4 className="h4" style={{ marginBottom: 20 }}>{title}</h4>
    </>
  )

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">{mode === 'create' ? 'Add New Product' : `Edit — ${form.name || 'Product'}`}</h1>
          <p className="admin-subtitle">FF&amp;E product specification</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => router.push('/admin/products')}>Cancel</button>
          <button type="submit" form="product-form" className="btn btn-primary btn-sm" disabled={isPending}>
            {isPending ? 'Saving…' : mode === 'create' ? 'Save Product' : 'Update Product'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#F8D7DA', color: '#721C24', padding: '12px 16px', marginBottom: 24, fontSize: 14 }}>
          {error}
        </div>
      )}

      <div className="tab-bar">
        {tabs.map(t => (
          <button key={t.id} className={`tab-btn${activeTab === t.id ? ' active' : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <form id="product-form" onSubmit={handleSubmit} noValidate>
        <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 40 }}>

          {/* ══════════════════════════════════════════════════
              TAB: PRODUCT DETAILS
          ══════════════════════════════════════════════════ */}
          {activeTab === 'basic' && (
            <div>
              <div className="form-group">
                <label className="form-label">Product name *</label>
                <input type="text" required className="form-input" value={form.name} onChange={handleNameChange} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Slug (URL) *</label>
                  <input type="text" required className="form-input" value={form.slug} onChange={set('slug')} />
                  <p className="form-hint">Auto-generated from name. Must be unique.</p>
                </div>
                <div className="form-group">
                  <label className="form-label">SKU</label>
                  <input type="text" className="form-input" value={form.sku} onChange={set('sku')} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Reference code</label>
                  <input type="text" className="form-input" value={form.referenceCode} onChange={set('referenceCode')} placeholder="e.g. FBA-LT-0012" />
                </div>
                <div className="form-group">
                  <label className="form-label">Artisan / Studio</label>
                  <select className="form-select" value={form.artisanId} onChange={set('artisanId')}>
                    <option value="">No artisan</option>
                    {artisans.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select className="form-select" required value={form.categoryId} onChange={set('categoryId')}
                    style={!form.categoryId ? { borderColor: '#B00020' } : undefined}>
                    <option value="">Select category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Subcategory</label>
                  <select className="form-select" value={form.subcategoryId} onChange={set('subcategoryId')}
                    disabled={!form.categoryId}>
                    <option value="">Select subcategory</option>
                    {selectedCategory?.subcategories?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    <option value="__new__">+ Add new subcategory…</option>
                  </select>
                  {form.subcategoryId === '__new__' && (
                    <input
                      type="text"
                      className="form-input"
                      style={{ marginTop: 8 }}
                      placeholder="New subcategory name (e.g. Sideboard)"
                      value={form.subcategoryName}
                      onChange={set('subcategoryName')}
                      autoFocus
                    />
                  )}
                  {form.subcategoryId === '__new__' && (
                    <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 4 }}>
                      Saved as a reusable subcategory under {selectedCategory?.name ?? 'this category'} for future products.
                    </p>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Short description</label>
                <input type="text" className="form-input" value={form.shortDescription} onChange={set('shortDescription')}
                  placeholder="One line summary for product cards" maxLength={160} />
              </div>
              <div className="form-group">
                <label className="form-label">Full description *</label>
                <textarea className="form-textarea" rows={6} required value={form.description} onChange={set('description')} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Lead time</label>
                  <input type="text" className="form-input" value={form.leadTime} onChange={set('leadTime')} placeholder="e.g. 10–14 weeks" />
                </div>
                <div className="form-group">
                  <label className="form-label">Shipping origin</label>
                  <input type="text" className="form-input" value={form.shippingOrigin} onChange={set('shippingOrigin')} placeholder="e.g. Rajasthan, India" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Shipping notes</label>
                <textarea className="form-textarea" rows={2} value={form.shippingNotes} onChange={set('shippingNotes')} />
              </div>
              <div className="form-group">
                <label className="form-label">Images (one Pexels URL per line)</label>
                <textarea className="form-textarea" rows={4} value={form.images} onChange={set('images')}
                  placeholder="https://images.pexels.com/photos/123456/pexels-photo-123456.jpeg?auto=compress&cs=tinysrgb&w=800" />
                <p className="form-hint">First image is the primary display image.</p>
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <label className="form-checkbox">
                  <input type="checkbox" checked={form.isFbaCollection} onChange={set('isFbaCollection')} />
                  <span style={{ fontSize: 13 }}>FBA Collection piece</span>
                </label>
                <label className="form-checkbox">
                  <input type="checkbox" checked={form.isFbaHome} onChange={set('isFbaHome')} />
                  <span style={{ fontSize: 13 }}>FBA Home piece</span>
                </label>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              TAB: SPECIFICATIONS
          ══════════════════════════════════════════════════ */}
          {activeTab === 'specs' && (
            <div>
              <h4 className="h4" style={{ marginBottom: 20 }}>Dimensions</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 32 }}>
                {([
                  ['widthMm', 'Width (mm)'], ['depthMm', 'Depth (mm)'], ['heightMm', 'Height (mm)'],
                  ['seatHeightMm', 'Seat height (mm)'], ['diameterMm', 'Diameter (mm)'], ['weightKg', 'Weight (kg)'],
                ] as [keyof FormData, string][]).map(([key, label]) => (
                  <div key={key} className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">{label}</label>
                    <input type="number" step="0.1" className="form-input" value={form[key] as string} onChange={set(key)} />
                  </div>
                ))}
              </div>

              <h4 className="h4" style={{ marginBottom: 20 }}>Materials & Finish</h4>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Material</label>
                  <input type="text" className="form-input" value={form.material} onChange={set('material')} placeholder="e.g. Solid oak, brass" />
                </div>
                <div className="form-group">
                  <label className="form-label">Finish</label>
                  <input type="text" className="form-input" value={form.finish} onChange={set('finish')} placeholder="e.g. Oiled, lacquered" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Fabric / Upholstery</label>
                <input type="text" className="form-input" value={form.fabric} onChange={set('fabric')} placeholder="e.g. FR-rated linen" />
              </div>
              <div className="form-group">
                <label className="form-checkbox">
                  <input type="checkbox" checked={form.comAvailable} onChange={set('comAvailable')} />
                  <span style={{ fontSize: 13 }}>COM (Customer's Own Material) available</span>
                </label>
              </div>
              {textAreaField('careInstructions', 'Care instructions')}
              {textAreaField('technicalNotes', 'Technical notes (fire rating, compliance, etc.)',
                'e.g. Crib 5 fire rating, CE marked, ISTA 3A packaging', 3)}

              {/* Lighting spec — legacy fields kept here for compatibility */}
              {isLighting && (
                <>
                  {sectionDivider('Lighting — Electrical & Legacy')}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                    {([
                      ['bulbType', 'Bulb type'], ['wattage', 'Wattage'], ['voltage', 'Voltage (V)'],
                      ['plugType', 'Plug type'], ['cableLength', 'Cable length'], ['ipRating', 'IP rating'],
                    ] as [keyof FormData, string][]).map(([key, label]) => (
                      <div key={key} className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">{label}</label>
                        <input type="text" className="form-input" value={form[key] as string} onChange={set(key)} />
                      </div>
                    ))}
                  </div>
                  <div className="form-group" style={{ marginTop: 16 }}>
                    <label className="form-checkbox">
                      <input type="checkbox" checked={form.dimmable} onChange={set('dimmable')} />
                      <span style={{ fontSize: 13 }}>Dimmable</span>
                    </label>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              TAB: MATERIAL CONFIG
          ══════════════════════════════════════════════════ */}
          {activeTab === 'materials' && (
            <div>

              {/* ── Generic (seating / accessories / any product) ── */}
              <h4 className="h4" style={{ marginBottom: 20 }}>Frame & Structure</h4>
              {textRow([['frameMaterial', 'Frame material'], ['frameMaterialOptions', 'Frame material options']])}
              {textRow([['frameFinishColourOptions', 'Frame finish / colour options']])}

              {sectionDivider('Armrests')}
              {textRow([['armrestMaterial', 'Armrest material'], ['armrestFinishColourOptions', 'Armrest finish / colour options']])}

              {sectionDivider('Seat & Back Upholstery')}
              {textRow([['seatMaterial', 'Seat material'], ['backMaterial', 'Back material']])}
              {textRow([['seatBackUpholsteryOptions', 'Seat & back upholstery options'], ['upholsteredLegsColourOptions', 'Upholstered legs colour options']])}

              {sectionDivider('Base, Glides & Use')}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Glides</label>
                  <input type="text" className="form-input" value={form.glides} onChange={set('glides')} placeholder="e.g. Plastic, Felt, Castors" />
                </div>
                <div className="form-group">
                  <label className="form-label">Indoor / Outdoor use</label>
                  <input type="text" className="form-input" value={form.indoorOutdoorUse} onChange={set('indoorOutdoorUse')} placeholder="e.g. Indoor only, Indoor & Outdoor" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 8 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Footprint (m²)</label>
                  <input type="number" step="0.01" className="form-input" value={form.footprintM2} onChange={set('footprintM2')} placeholder="e.g. 0.34" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Shipping volume (m³)</label>
                  <input type="number" step="0.01" className="form-input" value={form.shippingVolumeM3} onChange={set('shippingVolumeM3')} placeholder="e.g. 0.34" />
                </div>
                <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 2 }}>
                  <label className="form-checkbox">
                    <input type="checkbox" checked={form.stackable} onChange={set('stackable')} />
                    <span style={{ fontSize: 13 }}>Stackable</span>
                  </label>
                </div>
              </div>
              {textAreaField('otherAvailableOptions', 'Other available options',
                'Any bespoke / POA options not covered above')}

              {/* ── Table-specific ── */}
              {isTables && (
                <>
                  {sectionDivider('Table — Legs & Base')}
                  {textRow([['legMaterial', 'Leg material'], ['legMaterialOptions', 'Leg material options']])}
                  {textRow([['legFinishColourOptions', 'Leg finish / colour options'], ['basePedestalType', 'Base / pedestal type']])}
                  {textRow([['feetGlides', 'Feet / glides'], ['suitableTableTopSizes', 'Suitable table top sizes']])}

                  {sectionDivider('Table — Top')}
                  {textRow([['topMaterial', 'Top material'], ['topMaterialOptions', 'Top material options']])}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Top thickness (mm)</label>
                      <input type="number" step="0.5" className="form-input" value={form.topThicknessMm} onChange={set('topThicknessMm')} placeholder="e.g. 20" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Top finish / colour options</label>
                      <input type="text" className="form-input" value={form.topFinishColourOptions} onChange={set('topFinishColourOptions')} />
                    </div>
                  </div>
                  {textRow([['topShapeOptions', 'Top shape options'], ['topSizeOptions', 'Top size options']])}
                  {textAreaField('extensionOptions', 'Extension options',
                    'e.g. +500mm leaf, butterfly extension, self-storing leaf')}
                </>
              )}

              {/* ── Extended lighting config ── */}
              {isLighting && (
                <>
                  {sectionDivider('Lighting — Body & Materials')}
                  {textRow([['bodyFrameMaterial', 'Body / frame material'], ['baseMaterial', 'Base material']])}
                  {textRow([['diffuserShadeMaterial', 'Diffuser / shade material'], ['fringesTrimMaterial', 'Fringes / trim material']])}

                  {sectionDivider('Lighting — Colour Options')}
                  {textRow([['bodyFrameColourOptions', 'Body / frame colour options'], ['baseColourOptions', 'Base colour options']])}
                  {textRow([['diffuserShadeColourOptions', 'Diffuser / shade colour options'], ['fringesColourOptions', 'Fringes colour options']])}

                  {sectionDivider('Lighting — Power & Use')}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Suitable for</label>
                      <input type="text" className="form-input" value={form.suitableFor} onChange={set('suitableFor')}
                        placeholder="e.g. Indoor only, Outdoor rated" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Battery life</label>
                      <input type="text" className="form-input" value={form.batteryLife} onChange={set('batteryLife')}
                        placeholder="e.g. 6.5 Hours" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-checkbox">
                      <input type="checkbox" checked={form.rechargeable} onChange={set('rechargeable')} />
                      <span style={{ fontSize: 13 }}>Rechargeable</span>
                    </label>
                  </div>

                  {sectionDivider('Lighting — Light Source')}
                  {textRow([['lightSourceType', 'Light source type'], ['recommendedLightSource', 'Recommended light source']])}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 8 }}>
                    {([
                      ['lumens', 'Lumens'],
                      ['colourTemperature', 'Colour temperature'],
                      ['averageLifeLightSource', 'Average lamp life'],
                    ] as [keyof FormData, string][]).map(([key, label]) => (
                      <div key={key} className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">{label}</label>
                        <input type="text" className="form-input" value={form[key] as string} onChange={set(key)} />
                      </div>
                    ))}
                  </div>
                  {textAreaField('sparePartsAvailable', 'Spare parts available')}
                  {textAreaField('lightingSpecNotes', 'Specification notes',
                    'e.g. LED module must be replaced by qualified personnel only', 3)}
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              TAB: PRICING & VISIBILITY
          ══════════════════════════════════════════════════ */}
          {activeTab === 'pricing' && (
            <div>
              <div className="form-group">
                <label className="form-label">Price type</label>
                <select className="form-select" value={form.priceType} onChange={set('priceType')}>
                  <option value="fixed">Fixed price</option>
                  <option value="price_on_request">Price on request</option>
                </select>
              </div>
              {form.priceType === 'fixed' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 8 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Currency</label>
                    <select className="form-select" value={form.currency} onChange={set('currency')}>
                      <option value="GBP">GBP £</option>
                      <option value="EUR">EUR €</option>
                      <option value="USD">USD $</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Retail price</label>
                    <input type="number" step="0.01" className="form-input" value={form.retailPrice} onChange={set('retailPrice')} placeholder="0.00" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Trade price</label>
                    <input type="number" step="0.01" className="form-input" value={form.tradePrice} onChange={set('tradePrice')} placeholder="0.00" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Supplier cost</label>
                    <input type="number" step="0.01" className="form-input" value={form.supplierCost} onChange={set('supplierCost')} placeholder="0.00" />
                    <p className="form-hint">Admin only — not shown to users</p>
                  </div>
                </div>
              )}
              <hr style={{ margin: '28px 0', border: 'none', borderTop: '1px solid var(--light-line)' }} />
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Visibility</label>
                  <select className="form-select" value={form.visibility} onChange={set('visibility')}>
                    <option value="draft">Draft (not visible)</option>
                    <option value="published">Published</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Audience</label>
                  <select className="form-select" value={form.audience} onChange={set('audience')}>
                    <option value="retail_and_trade">Retail &amp; Trade</option>
                    <option value="retail">Retail only</option>
                    <option value="trade">Trade only</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              TAB: SEO
          ══════════════════════════════════════════════════ */}
          {activeTab === 'seo' && (
            <div>
              <div className="form-group">
                <label className="form-label">SEO title</label>
                <input type="text" className="form-input" value={form.seoTitle} onChange={set('seoTitle')} maxLength={60} />
                <p className="form-hint">Max 60 characters. Defaults to product name.</p>
              </div>
              <div className="form-group">
                <label className="form-label">SEO description</label>
                <textarea className="form-textarea" rows={3} value={form.seoDescription} onChange={set('seoDescription')} maxLength={160} />
                <p className="form-hint">Max 160 characters. Used in search snippets.</p>
              </div>
            </div>
          )}

        </div>
      </form>
    </>
  )
}
