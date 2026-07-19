// ============================================================
// Product completeness breakdown (QA item 1, July 2026).
//
// The product_health SQL view (supabase/migrations/
// 20260707_product_health_view.sql) exposes 11 boolean checks and a
// 0–100 score. This module is the single client/server-shared source
// for the labels and per-check hints, so the admin list popover and
// the edit-page checklist always match the view exactly.
//
// Every check is category-neutral by design — no product is
// penalised for fields that don't apply to its category (QA item 2).
// PURE logic only — safe for tsconfig.test.json unit tests.
// ============================================================

export interface ProductHealthChecks {
  has_hero_image: boolean
  has_three_images: boolean
  has_category: boolean
  has_artisan: boolean
  has_origin: boolean
  has_short_description: boolean
  has_technical_description: boolean
  has_lead_time: boolean
  has_seo: boolean
  has_spec_doc: boolean
  has_finishes: boolean
}

export const COMPLETENESS_CHECKS: Array<{
  key: keyof ProductHealthChecks
  label: string
  hint: string
}> = [
  { key: 'has_hero_image',            label: 'At least 1 image',            hint: 'Product Details → Images' },
  { key: 'has_three_images',          label: '3 or more images',            hint: 'Product Details → Images' },
  { key: 'has_category',              label: 'Category set',                hint: 'Product Details → Category' },
  { key: 'has_artisan',               label: 'Artisan / studio set',        hint: 'Product Details → Artisan' },
  { key: 'has_origin',                label: 'Shipping origin',             hint: 'Product Details → Shipping origin' },
  { key: 'has_short_description',     label: 'Short description',           hint: 'Product Details → Short description' },
  { key: 'has_technical_description', label: 'Technical description',       hint: 'Extras → Fulfilment tab' },
  { key: 'has_lead_time',             label: 'Lead time',                   hint: 'Product Details → Lead time' },
  { key: 'has_seo',                   label: 'SEO title + description',     hint: 'SEO tab' },
  { key: 'has_spec_doc',              label: 'Product specification doc',   hint: 'Extras → Documents tab' },
  { key: 'has_finishes',              label: 'Finish / colour options',     hint: 'Extras → Hard finishes / Upholstery' },
]

export interface CompletenessBreakdown {
  done: number
  total: number
  percent: number
  missing: Array<{ key: keyof ProductHealthChecks; label: string; hint: string }>
}

export function completenessBreakdown(checks: Partial<ProductHealthChecks> | null | undefined): CompletenessBreakdown {
  const missing: CompletenessBreakdown['missing'] = []
  let done = 0
  for (const c of COMPLETENESS_CHECKS) {
    if (checks?.[c.key] === true) done += 1
    else missing.push({ key: c.key, label: c.label, hint: c.hint })
  }
  const total = COMPLETENESS_CHECKS.length
  // Mirror the SQL view's integer arithmetic (score * 100 / 11, floored)
  const percent = Math.floor((done * 100) / total)
  return { done, total, percent, missing }
}
