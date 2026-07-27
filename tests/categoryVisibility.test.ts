import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bypassesCategoryVisibility,
  categoryIsPublic,
  productCategoryIsPublic,
  productIsPubliclyReachable,
  type ProductCategoryFields,
} from '../lib/categoryRules'

// ============================================================
// Spec §5 — hiding a category must hide its products from every public
// surface, including the direct product URL. These cover the exact
// scenario matrix in the brief's "Category tests" section.
// ============================================================

const CAT_VISIBLE  = { is_visible: true,  archived_at: null }
const CAT_HIDDEN   = { is_visible: false, archived_at: null }
const CAT_ARCHIVED = { is_visible: true,  archived_at: '2026-07-20T10:00:00.000Z' }

function published(over: Partial<ProductCategoryFields> = {}): ProductCategoryFields {
  return {
    visibility: 'published',
    archived_at: null,
    deleted_at: null,
    category_id: 'cat-1',
    category: CAT_VISIBLE,
    ...over,
  }
}

// ── Category status ──────────────────────────────────────────

test('categoryIsPublic: visible and not archived', () => {
  assert.equal(categoryIsPublic(CAT_VISIBLE), true)
})

test('categoryIsPublic: hidden category is not public', () => {
  assert.equal(categoryIsPublic(CAT_HIDDEN), false)
})

test('categoryIsPublic: archived category is not public even when is_visible is true', () => {
  assert.equal(categoryIsPublic(CAT_ARCHIVED), false)
})

test('categoryIsPublic: a missing category row fails closed', () => {
  assert.equal(categoryIsPublic(null), false)
  assert.equal(categoryIsPublic(undefined), false)
})

// ── Scenario 1: product in one visible category ──────────────

test('scenario 1: published product in a visible category is reachable', () => {
  assert.equal(productIsPubliclyReachable(published()), true)
})

// ── Scenario 2: product in one hidden category ───────────────

test('scenario 2: published product in a hidden category is NOT reachable', () => {
  assert.equal(productIsPubliclyReachable(published({ category: CAT_HIDDEN })), false)
})

test('scenario 2: the direct-URL gate uses the same rule (supersedes the old "reachable by link" behaviour)', () => {
  assert.equal(productCategoryIsPublic(published({ category: CAT_HIDDEN })), false)
})

// ── Scenario 3: product in one archived category ──────────────

test('scenario 3: published product in an archived category is NOT reachable', () => {
  assert.equal(productIsPubliclyReachable(published({ category: CAT_ARCHIVED })), false)
})

// ── Scenarios 4 and 5: the single-FK equivalent ───────────────
// products.category_id is a single foreign key in this schema, so "all of
// a product's categories" collapses to its one category. These assert the
// intended multi-category semantics on that model: at least one visible
// category ⇒ visible; every category hidden ⇒ hidden.

test('scenario 4: a product keeps its visible category and stays reachable', () => {
  assert.equal(productIsPubliclyReachable(published({ category: CAT_VISIBLE })), true)
})

test('scenario 5: a product with no visible category is hidden', () => {
  assert.equal(productIsPubliclyReachable(published({ category: CAT_HIDDEN })), false)
  assert.equal(productIsPubliclyReachable(published({ category: CAT_ARCHIVED })), false)
})

test('uncategorised product inherits nothing and stays reachable', () => {
  assert.equal(productIsPubliclyReachable(published({ category_id: null, category: null })), true)
})

test('dangling category reference fails closed rather than leaking the product', () => {
  assert.equal(productIsPubliclyReachable(published({ category_id: 'cat-x', category: null })), false)
})

// ── Scenario 6: unpublished product in a visible category ─────

test('scenario 6: draft product in a visible category is not reachable', () => {
  assert.equal(productIsPubliclyReachable(published({ visibility: 'draft' })), false)
})

test('archived product in a visible category is not reachable', () => {
  assert.equal(productIsPubliclyReachable(published({ archived_at: '2026-07-01T00:00:00.000Z' })), false)
})

test('soft-deleted product in a visible category is not reachable', () => {
  assert.equal(productIsPubliclyReachable(published({ deleted_at: '2026-07-01T00:00:00.000Z' })), false)
})

// ── Staff bypass: the admin catalogue is unaffected ───────────

test('admin and staff bypass category visibility; other roles do not', () => {
  assert.equal(bypassesCategoryVisibility('admin'), true)
  assert.equal(bypassesCategoryVisibility('staff'), true)
  assert.equal(bypassesCategoryVisibility('trade_user'), false)
  assert.equal(bypassesCategoryVisibility('retail_user'), false)
  assert.equal(bypassesCategoryVisibility(null), false)
  assert.equal(bypassesCategoryVisibility(undefined), false)
})

test('staff can still open a product whose category is hidden', () => {
  const hidden = published({ category: CAT_HIDDEN })
  assert.equal(productIsPubliclyReachable(hidden, 'admin'), true)
  assert.equal(productIsPubliclyReachable(hidden, 'staff'), true)
  assert.equal(productIsPubliclyReachable(hidden, 'trade_user'), false)
})

test('re-publishing a category restores visibility with no other change', () => {
  const beforeHide = published({ category: CAT_VISIBLE })
  const whileHidden = published({ category: CAT_HIDDEN })
  const afterRepublish = published({ category: CAT_VISIBLE })
  assert.equal(productIsPubliclyReachable(beforeHide), true)
  assert.equal(productIsPubliclyReachable(whileHidden), false)
  assert.equal(productIsPubliclyReachable(afterRepublish), true)
})

// ── PostgREST embed shape ────────────────────────────────────
// supabase-js types a many-to-one embed as an array even though PostgREST
// returns a single object, so both shapes must resolve identically.

test('category embed accepts both the object and single-element array shape', () => {
  assert.equal(categoryIsPublic([CAT_VISIBLE]), true)
  assert.equal(categoryIsPublic([CAT_HIDDEN]), false)
  assert.equal(categoryIsPublic([]), false)
  assert.equal(
    productCategoryIsPublic({ category_id: 'cat-1', category: [CAT_HIDDEN] }),
    false,
  )
  assert.equal(
    productCategoryIsPublic({ category_id: 'cat-1', category: [CAT_VISIBLE] }),
    true,
  )
})
