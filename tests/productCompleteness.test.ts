import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPLETENESS_CHECKS,
  completenessBreakdown,
  type ProductHealthChecks,
} from '../lib/productCompleteness'

const ALL_TRUE: ProductHealthChecks = {
  has_hero_image: true,
  has_three_images: true,
  has_category: true,
  has_artisan: true,
  has_origin: true,
  has_short_description: true,
  has_technical_description: true,
  has_lead_time: true,
  has_seo: true,
  has_spec_doc: true,
  has_finishes: true,
}

test('11 checks, mirroring the product_health view', () => {
  assert.equal(COMPLETENESS_CHECKS.length, 11)
  const keys = new Set(COMPLETENESS_CHECKS.map(c => c.key))
  assert.equal(keys.size, 11)
})

test('all checks passing → 100%, nothing missing', () => {
  const b = completenessBreakdown(ALL_TRUE)
  assert.equal(b.done, 11)
  assert.equal(b.total, 11)
  assert.equal(b.percent, 100)
  assert.deepEqual(b.missing, [])
})

test('no checks passing → 0%, everything missing', () => {
  const b = completenessBreakdown({})
  assert.equal(b.done, 0)
  assert.equal(b.percent, 0)
  assert.equal(b.missing.length, 11)
})

test('null / undefined input treated as empty', () => {
  assert.equal(completenessBreakdown(null).percent, 0)
  assert.equal(completenessBreakdown(undefined).percent, 0)
})

test('percent uses the same floored integer arithmetic as the SQL view', () => {
  // 7 of 11 → floor(700/11) = 63, matching "63%" observed in QA
  const partial = { ...ALL_TRUE, has_seo: false, has_spec_doc: false, has_finishes: false, has_three_images: false }
  const b = completenessBreakdown(partial)
  assert.equal(b.done, 7)
  assert.equal(b.percent, 63)
  // 8 of 11 → floor(800/11) = 72
  const b8 = completenessBreakdown({ ...partial, has_seo: true })
  assert.equal(b8.percent, 72)
})

test('missing entries carry label and location hint', () => {
  const b = completenessBreakdown({ ...ALL_TRUE, has_seo: false })
  assert.equal(b.missing.length, 1)
  assert.equal(b.missing[0].key, 'has_seo')
  assert.ok(b.missing[0].label.length > 0)
  assert.ok(b.missing[0].hint.length > 0)
})

test('non-true values (false, undefined) count as missing', () => {
  const b = completenessBreakdown({ has_hero_image: true, has_category: false })
  assert.equal(b.done, 1)
  assert.equal(b.missing.length, 10)
})
