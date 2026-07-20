import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MEDIA_BUCKETS, isMediaBucket, ASPECT_PRESETS, orientedRatio,
  rotatedDims, minCoverScale, clampOffset, computeExtract,
  validateEditParams, editedCopyPath, trashPath,
  storagePathFromPublicUrl, collectImageUrls,
  HERO_SLOTS, isHeroSlotKey, validateAssignParams,
  UPLOAD_MIME_EXT, MAX_UPLOAD_BYTES,
  MAX_OUTPUT_PX, type MediaEditParams,
  // Phase 2 (picker rebuild)
  isKeepFile, KEEP_FILE, validateFolderName, validateFolderPath,
  MAX_FOLDER_DEPTH, joinPath, parentFolder, fileName, isEditedCopy,
  sortMediaFiles, matchesTypeFilter, matchesUsedFilter,
  storageBarLevel, formatBytes, DEFAULT_STORAGE_CAP_MB,
} from '../lib/mediaShared'

const SUPA = 'https://qnuqvdzguesetnevhsoc.supabase.co'

// ============================================================
// Buckets & presets
// ============================================================

test('media buckets are the public image buckets only', () => {
  assert.deepEqual([...MEDIA_BUCKETS], ['product-media', 'site-assets'])
  assert.equal(isMediaBucket('product-media'), true)
  assert.equal(isMediaBucket('delivery-pod'), false)
  assert.equal(isMediaBucket(null), false)
})

test('aspect presets match the Wix set', () => {
  assert.deepEqual(ASPECT_PRESETS.map(p => p.key),
    ['free', 'original', '1:1', '1:2', '9:16', '2:3', '3:4', '4:5'])
})

test('orientedRatio flips portrait ratios for landscape', () => {
  assert.equal(orientedRatio(3 / 4, true), 4 / 3)   // landscape wants wide
  assert.equal(orientedRatio(3 / 4, false), 3 / 4)  // portrait keeps tall
  assert.equal(orientedRatio(1, true), 1)           // square unaffected
  assert.equal(orientedRatio(1, false), 1)
})

// ============================================================
// Rotation geometry
// ============================================================

test('rotatedDims: 0° and 180° keep dimensions', () => {
  assert.deepEqual(rotatedDims(800, 600, 0), { w: 800, h: 600 })
  assert.deepEqual(rotatedDims(800, 600, 180), { w: 800, h: 600 })
})

test('rotatedDims: 90° swaps dimensions', () => {
  assert.deepEqual(rotatedDims(800, 600, 90), { w: 600, h: 800 })
  assert.deepEqual(rotatedDims(800, 600, -90), { w: 600, h: 800 })
})

test('rotatedDims: 45° square grows to the diagonal', () => {
  const { w, h } = rotatedDims(100, 100, 45)
  assert.equal(w, Math.round(100 * Math.SQRT2))
  assert.equal(h, Math.round(100 * Math.SQRT2))
})

test('minCoverScale covers the viewport on the tighter axis', () => {
  assert.equal(minCoverScale(1000, 500, 100, 100), 100 / 500) // height binds
  assert.equal(minCoverScale(500, 1000, 100, 100), 100 / 500) // width binds
  assert.equal(minCoverScale(0, 0, 100, 100), 1)              // degenerate
})

test('clampOffset keeps the image over the viewport', () => {
  // image 400 wide (scaled) in a 100 viewport: offset must be in [-300, 0]
  assert.equal(clampOffset(50, 400, 100), 0)
  assert.equal(clampOffset(-500, 400, 100), -300)
  assert.equal(clampOffset(-150, 400, 100), -150)
  // image smaller than viewport → centred
  assert.equal(clampOffset(0, 60, 100), 20)
})

test('computeExtract maps viewport to source pixels', () => {
  // 2000×1000 image at scale 0.5 (screen 1000×500), viewport 400×300,
  // panned so screen (-100,-50) is the viewport origin.
  const r = computeExtract({ scale: 0.5, offsetX: -100, offsetY: -50, viewW: 400, viewH: 300, imgW: 2000, imgH: 1000 })
  assert.deepEqual(r, { left: 200, top: 100, width: 800, height: 600 })
})

test('computeExtract clamps to image bounds', () => {
  const r = computeExtract({ scale: 1, offsetX: -1900, offsetY: -900, viewW: 400, viewH: 300, imgW: 2000, imgH: 1000 })
  assert.equal(r.left + r.width <= 2000, true)
  assert.equal(r.top + r.height <= 1000, true)
  assert.equal(r.width >= 1 && r.height >= 1, true)
})

// ============================================================
// Edit validation
// ============================================================

const okParams: MediaEditParams = {
  bucket: 'product-media', path: 'products/x/a.jpg', rotate: 0,
  crop: { left: 0, top: 0, width: 100, height: 100 },
  outputWidth: 900, outputHeight: 900,
}

test('validateEditParams accepts a sane request', () => {
  assert.equal(validateEditParams(okParams), null)
})

test('validateEditParams rejects bad buckets, traversal and trash', () => {
  assert.ok(validateEditParams({ ...okParams, bucket: 'documents' }))
  assert.ok(validateEditParams({ ...okParams, path: '../secrets.jpg' }))
  assert.ok(validateEditParams({ ...okParams, path: '/abs.jpg' }))
  assert.ok(validateEditParams({ ...okParams, path: 'trash/products/x/a.jpg' }))
})

test('validateEditParams bounds rotation and output size', () => {
  assert.ok(validateEditParams({ ...okParams, rotate: 200 }))
  assert.ok(validateEditParams({ ...okParams, rotate: NaN }))
  assert.equal(validateEditParams({ ...okParams, rotate: -180 }), null)
  assert.ok(validateEditParams({ ...okParams, outputWidth: 0 }))
  assert.ok(validateEditParams({ ...okParams, outputWidth: MAX_OUTPUT_PX + 1 }))
  assert.equal(validateEditParams({ ...okParams, outputWidth: null, outputHeight: null }), null)
})

test('validateEditParams rejects empty or negative crops', () => {
  assert.ok(validateEditParams({ ...okParams, crop: { left: 0, top: 0, width: 0, height: 100 } }))
  assert.ok(validateEditParams({ ...okParams, crop: { left: -5, top: 0, width: 10, height: 10 } }))
})

// ============================================================
// Paths
// ============================================================

test('editedCopyPath keeps folder and extension, never overwrites', () => {
  const p = editedCopyPath('products/abc/photo.jpg', 'a1b2c3')
  assert.equal(p, 'products/abc/photo-edit-a1b2c3.jpg')
  assert.notEqual(p, 'products/abc/photo.jpg')
})

test('editedCopyPath handles no-folder and no-extension inputs', () => {
  assert.equal(editedCopyPath('photo.png', 'ff'), 'photo-edit-ff.png')
  assert.equal(editedCopyPath('imports/blob', 'ff'), 'imports/blob-edit-ff.jpg')
  assert.equal(editedCopyPath('a/b.webp', 'ff', 'jpeg'), 'a/b-edit-ff.jpeg')
})

test('trashPath prefixes without losing the original path', () => {
  assert.equal(trashPath('products/abc/p.jpg'), 'trash/products/abc/p.jpg')
})

// ============================================================
// URL parsing / SSRF allowlist
// ============================================================

test('storagePathFromPublicUrl parses our public object URLs', () => {
  const r = storagePathFromPublicUrl(`${SUPA}/storage/v1/object/public/product-media/products/x/a.jpg`, SUPA)
  assert.deepEqual(r, { bucket: 'product-media', path: 'products/x/a.jpg' })
})

test('storagePathFromPublicUrl rejects foreign hosts and non-storage paths', () => {
  assert.equal(storagePathFromPublicUrl('https://images.pexels.com/photos/1/x.jpg', SUPA), null)
  assert.equal(storagePathFromPublicUrl(`${SUPA}/rest/v1/products`, SUPA), null)
  assert.equal(storagePathFromPublicUrl('not a url', SUPA), null)
  assert.equal(storagePathFromPublicUrl('', SUPA), null)
})

// ============================================================
// Uploads & assignment (Sprint 23.1 — URL import removed by
// decision: the library is upload-only)
// ============================================================

test('upload accepts only image MIME types, capped at 15MB', () => {
  assert.equal(UPLOAD_MIME_EXT['image/jpeg'], 'jpg')
  assert.equal(UPLOAD_MIME_EXT['image/png'], 'png')
  assert.equal(UPLOAD_MIME_EXT['image/webp'], 'webp')
  assert.equal(UPLOAD_MIME_EXT['application/pdf'], undefined)
  assert.equal(UPLOAD_MIME_EXT['image/svg+xml'], undefined) // SVG can carry scripts
  assert.equal(MAX_UPLOAD_BYTES, 15 * 1024 * 1024)
})

test('hero slots cover every HeroImageUploader key and are unique', () => {
  const keys = HERO_SLOTS.map(s => s.key)
  assert.deepEqual(keys, [
    'home_hero_image', 'the_edit_hero_image', 'collection_hero_image',
    'artisans_hero_image', 'journal_hero_image', 'about_hero_image',
    'home_pillars_image', 'about_maker_image',
  ])
  assert.equal(new Set(keys).size, keys.length)
  for (const s of HERO_SLOTS) assert.ok(s.label.length > 0)
})

test('isHeroSlotKey allows only the allowlisted keys', () => {
  assert.equal(isHeroSlotKey('home_hero_image'), true)
  assert.equal(isHeroSlotKey('commercial_settings'), false) // must never touch other settings
  assert.equal(isHeroSlotKey(''), false)
  assert.equal(isHeroSlotKey(null), false)
})

test('validateAssignParams: product and hero targets accepted', () => {
  const base = { bucket: 'site-assets', path: 'uploads/a.jpg' }
  assert.equal(validateAssignParams({ ...base, target: { type: 'product', productId: 'abc' } }), null)
  assert.equal(validateAssignParams({ ...base, target: { type: 'site_setting', key: 'home_hero_image' } }), null)
})

test('validateAssignParams rejects bad buckets, paths and targets', () => {
  const target = { type: 'product' as const, productId: 'abc' }
  assert.ok(validateAssignParams({ bucket: 'documents', path: 'a.jpg', target }))
  assert.ok(validateAssignParams({ bucket: 'site-assets', path: '../x.jpg', target }))
  assert.ok(validateAssignParams({ bucket: 'site-assets', path: 'trash/a.jpg', target }))
  assert.ok(validateAssignParams({ bucket: 'site-assets', path: 'a.jpg' }))
  assert.ok(validateAssignParams({ bucket: 'site-assets', path: 'a.jpg', target: { type: 'product', productId: '' } }))
  assert.ok(validateAssignParams({ bucket: 'site-assets', path: 'a.jpg', target: { type: 'site_setting', key: 'nope' } }))
})

// ============================================================
// Phase 2: folders, sorting/filtering, storage bar
// ============================================================

test('folder names: lowercase/digits/hyphens only, reserved names blocked', () => {
  assert.equal(validateFolderName('lounge-chairs'), null)
  assert.equal(validateFolderName('a1'), null)
  assert.ok(validateFolderName(''))
  assert.ok(validateFolderName('Has Spaces'))
  assert.ok(validateFolderName('UPPER'))
  assert.ok(validateFolderName('trash'))          // reserved
  assert.ok(validateFolderName('a'.repeat(41)))   // too long
})

test('folder paths: depth capped, traversal and trash blocked', () => {
  assert.equal(validateFolderPath(''), null)
  assert.equal(validateFolderPath('products'), null)
  assert.equal(validateFolderPath('products/abc-123/gallery'), null)
  assert.ok(validateFolderPath('a/b/c/d'))          // > MAX_FOLDER_DEPTH
  assert.equal(MAX_FOLDER_DEPTH, 3)
  assert.ok(validateFolderPath('../x'))
  assert.ok(validateFolderPath('a//b'))
  assert.ok(validateFolderPath('trash'))
  assert.ok(validateFolderPath('trash/products'))
})

test('path utilities and .keep placeholder', () => {
  assert.equal(joinPath('', 'a.jpg'), 'a.jpg')
  assert.equal(joinPath('uploads', 'a.jpg'), 'uploads/a.jpg')
  assert.equal(parentFolder('uploads/a.jpg'), 'uploads')
  assert.equal(parentFolder('a.jpg'), '')
  assert.equal(fileName('products/x/a.jpg'), 'a.jpg')
  assert.equal(isKeepFile(KEEP_FILE), true)
  assert.equal(isKeepFile('keep.jpg'), false)
})

test('isEditedCopy recognises editor output only', () => {
  assert.equal(isEditedCopy('photo-edit-a1b2c3.jpg'), true)
  assert.equal(isEditedCopy('photo.jpg'), false)
  assert.equal(isEditedCopy('photo-edit-XYZ.jpg'), false)
})

test('sortMediaFiles: all four orders', () => {
  const files = [
    { name: 'b.jpg', size: 10, updatedAt: '2026-07-02T00:00:00Z' },
    { name: 'a.jpg', size: 30, updatedAt: '2026-07-03T00:00:00Z' },
    { name: 'c.jpg', size: 20, updatedAt: '2026-07-01T00:00:00Z' },
  ]
  assert.deepEqual(sortMediaFiles(files, 'newest').map(f => f.name), ['a.jpg', 'b.jpg', 'c.jpg'])
  assert.deepEqual(sortMediaFiles(files, 'oldest').map(f => f.name), ['c.jpg', 'b.jpg', 'a.jpg'])
  assert.deepEqual(sortMediaFiles(files, 'name').map(f => f.name), ['a.jpg', 'b.jpg', 'c.jpg'])
  assert.deepEqual(sortMediaFiles(files, 'largest').map(f => f.name), ['a.jpg', 'c.jpg', 'b.jpg'])
  // input is not mutated
  assert.equal(files[0].name, 'b.jpg')
})

test('type filter treats jpg and jpeg as one; used filter splits on count', () => {
  assert.equal(matchesTypeFilter('a.JPG', 'jpg'), true)
  assert.equal(matchesTypeFilter('a.jpeg', 'jpg'), true)
  assert.equal(matchesTypeFilter('a.png', 'jpg'), false)
  assert.equal(matchesTypeFilter('a.png', ''), true)
  assert.equal(matchesUsedFilter(2, 'used'), true)
  assert.equal(matchesUsedFilter(0, 'used'), false)
  assert.equal(matchesUsedFilter(0, 'unused'), true)
  assert.equal(matchesUsedFilter(3, ''), true)
})

test('storage bar levels at 80% and 95%', () => {
  const mb = 1024 * 1024
  assert.equal(storageBarLevel(100 * mb, 1024), 'ok')
  assert.equal(storageBarLevel(820 * mb, 1024), 'warn')      // ≥ 80%
  assert.equal(storageBarLevel(975 * mb, 1024), 'critical')  // ≥ 95%
  // Bad cap falls back to the default rather than dividing by zero
  assert.equal(storageBarLevel(10 * mb, 0), 'ok')
  assert.equal(DEFAULT_STORAGE_CAP_MB, 1024)
})

test('formatBytes is human-readable', () => {
  assert.equal(formatBytes(null), '—')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(44 * 1024), '44 KB')
  assert.equal(formatBytes(2.5 * 1024 * 1024), '2.5 MB')
})

// ============================================================
// Usage-map URL harvesting
// ============================================================

test('collectImageUrls finds image URLs in nested JSON', () => {
  const value = {
    heroImage: 'https://images.pexels.com/photos/1/x.jpeg?auto=compress',
    nested: { arr: [`${SUPA}/storage/v1/object/public/site-assets/hero.png`, 'not-an-image'] },
    color: '#fff', size: 12,
  }
  const urls = collectImageUrls(value)
  assert.equal(urls.length, 2)
  assert.ok(urls.includes('https://images.pexels.com/photos/1/x.jpeg?auto=compress'))
})

test('collectImageUrls ignores non-image strings and respects depth cap', () => {
  assert.deepEqual(collectImageUrls('hello'), [])
  assert.deepEqual(collectImageUrls(null), [])
  let deep: unknown = 'https://images.pexels.com/a.jpg'
  for (let i = 0; i < 10; i++) deep = { deep }
  assert.deepEqual(collectImageUrls(deep), [])
})
