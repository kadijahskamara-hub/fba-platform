// ============================================================
// Media Library — pure, client-safe helpers (Sprint 23).
//
// Everything here is side-effect free so both the /admin/media UI
// and the server routes share one source of truth, and it can all
// be unit-tested without Supabase or sharp.
// ============================================================

// ---------- Buckets ----------
// The library browses PUBLIC image buckets only. Private buckets
// (delivery-pod signatures, generated documents, …) intentionally
// stay out of the browser/editor.
export const MEDIA_BUCKETS = ['product-media', 'site-assets'] as const
export type MediaBucket = (typeof MEDIA_BUCKETS)[number]

export function isMediaBucket(b: string | null | undefined): b is MediaBucket {
  return MEDIA_BUCKETS.includes(b as MediaBucket)
}

// ---------- Aspect presets (Wix Photo Studio parity) ----------
export type AspectPreset = { key: string; label: string; ratio: number | null }
export const ASPECT_PRESETS: AspectPreset[] = [
  { key: 'free',     label: 'Free',     ratio: null },
  { key: 'original', label: 'Original', ratio: -1 },   // -1 = source image's own ratio
  { key: '1:1',      label: '1:1',      ratio: 1 },
  { key: '1:2',      label: '1:2',      ratio: 1 / 2 },
  { key: '9:16',     label: '9:16',     ratio: 9 / 16 },
  { key: '2:3',      label: '2:3',      ratio: 2 / 3 },
  { key: '3:4',      label: '3:4',      ratio: 3 / 4 },
  { key: '4:5',      label: '4:5',      ratio: 4 / 5 },
]

// Landscape orientation flips a portrait ratio (and vice versa).
export function orientedRatio(ratio: number, landscape: boolean): number {
  if (ratio <= 0) return ratio
  const portrait = ratio <= 1
  return landscape === !portrait ? ratio : 1 / ratio
}

// ---------- Rotation geometry ----------
// sharp rotates first, producing a bounding box; the client previews
// the same bounding box, so extract rects line up 1:1.
export function rotatedDims(w: number, h: number, deg: number): { w: number; h: number } {
  const r = (Math.abs(deg) % 180) * (Math.PI / 180)
  const sin = Math.sin(r), cos = Math.cos(r)
  return {
    w: Math.round(Math.abs(w * cos) + Math.abs(h * sin)),
    h: Math.round(Math.abs(w * sin) + Math.abs(h * cos)),
  }
}

// Smallest scale at which the (rotated) image fully covers the viewport.
export function minCoverScale(imgW: number, imgH: number, viewW: number, viewH: number): number {
  if (imgW <= 0 || imgH <= 0) return 1
  return Math.max(viewW / imgW, viewH / imgH)
}

// Clamp a pan offset so the scaled image never leaves a gap in the viewport.
export function clampOffset(offset: number, imgSizeScaled: number, viewSize: number): number {
  const min = viewSize - imgSizeScaled  // most-negative allowed
  if (min >= 0) return min / 2          // image smaller than view: centre it
  return Math.min(0, Math.max(min, offset))
}

export type ExtractRect = { left: number; top: number; width: number; height: number }

// Viewport → source-pixel extract rect. offsets are the top-left of the
// scaled image relative to the viewport (≤ 0 when panned).
export function computeExtract(args: {
  scale: number; offsetX: number; offsetY: number
  viewW: number; viewH: number; imgW: number; imgH: number
}): ExtractRect {
  const { scale, offsetX, offsetY, viewW, viewH, imgW, imgH } = args
  const s = scale > 0 ? scale : 1
  let left   = Math.round(-offsetX / s)
  let top    = Math.round(-offsetY / s)
  let width  = Math.round(viewW / s)
  let height = Math.round(viewH / s)
  left = Math.max(0, Math.min(left, Math.max(0, imgW - 1)))
  top  = Math.max(0, Math.min(top,  Math.max(0, imgH - 1)))
  width  = Math.max(1, Math.min(width,  imgW - left))
  height = Math.max(1, Math.min(height, imgH - top))
  return { left, top, width, height }
}

// ---------- Edit request validation (server + client) ----------
export type MediaEditParams = {
  bucket: string
  path: string
  rotate: number          // degrees, -180..180
  crop: ExtractRect       // in rotated-image pixel space
  outputWidth?: number | null
  outputHeight?: number | null
}

export const MAX_OUTPUT_PX = 8000

export function validateEditParams(p: MediaEditParams): string | null {
  if (!isMediaBucket(p.bucket)) return 'Unknown bucket.'
  if (!p.path || p.path.includes('..') || p.path.startsWith('/')) return 'Invalid path.'
  if (p.path.startsWith('trash/')) return 'This file is in the trash.'
  if (!Number.isFinite(p.rotate) || p.rotate < -180 || p.rotate > 180) return 'Rotation must be between -180 and 180 degrees.'
  const c = p.crop
  if (!c || [c.left, c.top, c.width, c.height].some(n => !Number.isFinite(n) || n < 0)) return 'Invalid crop.'
  if (c.width < 1 || c.height < 1) return 'Crop area is empty.'
  for (const dim of [p.outputWidth, p.outputHeight]) {
    if (dim === undefined || dim === null) continue
    if (!Number.isFinite(dim) || dim < 1 || dim > MAX_OUTPUT_PX) return `Output size must be 1–${MAX_OUTPUT_PX}px.`
  }
  return null
}

// ---------- Paths ----------
// Edits are always saved as a NEW copy next to the original —
// originals are never overwritten.
export function editedCopyPath(path: string, suffixHex: string, forceExt?: string): string {
  const slash = path.lastIndexOf('/')
  const dir = slash >= 0 ? path.slice(0, slash + 1) : ''
  const file = slash >= 0 ? path.slice(slash + 1) : path
  const dot = file.lastIndexOf('.')
  const base = dot > 0 ? file.slice(0, dot) : file
  const ext = forceExt ?? (dot > 0 ? file.slice(dot + 1) : 'jpg')
  return `${dir}${base}-edit-${suffixHex}.${ext}`
}

// Deletes are soft: objects move under trash/ and keep their old path.
export function trashPath(path: string): string {
  return `trash/${path}`
}

// Parse a Supabase public-object URL back into { bucket, path }.
// Returns null for anything else (Pexels, other CDNs, relative paths).
export function storagePathFromPublicUrl(url: string, supabaseUrl: string): { bucket: string; path: string } | null {
  if (!url || !supabaseUrl) return null
  const marker = '/storage/v1/object/public/'
  try {
    const u = new URL(url)
    const su = new URL(supabaseUrl)
    if (u.host !== su.host) return null
    const i = u.pathname.indexOf(marker)
    if (i < 0) return null
    const rest = u.pathname.slice(i + marker.length)
    const slash = rest.indexOf('/')
    if (slash <= 0 || slash === rest.length - 1) return null
    return { bucket: rest.slice(0, slash), path: decodeURIComponent(rest.slice(slash + 1)) }
  } catch {
    return null
  }
}

// ---------- Usage-map URL harvesting ----------
const IMG_URL_RE = /^https?:\/\/.+\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i
const STORAGE_URL_RE = /\/storage\/v1\/object\/public\//

// Walk a JSON blob (site_settings values) collecting image-looking URLs.
export function collectImageUrls(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) return []
  if (typeof value === 'string') {
    return IMG_URL_RE.test(value) || STORAGE_URL_RE.test(value) ? [value] : []
  }
  if (Array.isArray(value)) return value.flatMap(v => collectImageUrls(v, depth + 1))
  if (typeof value === 'object') return Object.values(value).flatMap(v => collectImageUrls(v, depth + 1))
  return []
}

// ---------- Uploads ----------
export const UPLOAD_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif',
}
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

// ---------- Assignment targets ----------
// Site slots an image can be assigned to. Values are { url, alt }
// in site_settings — mirrors HeroImageUploader.
export const HERO_SLOTS: Array<{ key: string; label: string }> = [
  { key: 'home_hero_image',       label: 'Homepage hero' },
  { key: 'the_edit_hero_image',   label: 'The Edit hero' },
  { key: 'collection_hero_image', label: 'FBA Collection hero' },
  { key: 'artisans_hero_image',   label: 'Artisans hero' },
  { key: 'journal_hero_image',    label: 'Journal hero' },
  { key: 'about_hero_image',      label: 'About hero' },
]

export function isHeroSlotKey(key: string | null | undefined): boolean {
  return HERO_SLOTS.some(s => s.key === key)
}

export type AssignTarget =
  | { type: 'product'; productId: string }
  | { type: 'site_setting'; key: string }

export function validateAssignParams(p: { bucket?: string; path?: string; target?: AssignTarget }): string | null {
  if (!isMediaBucket(p.bucket)) return 'Unknown bucket.'
  const path = p.path ?? ''
  if (!path || path.includes('..') || path.startsWith('/')) return 'Invalid path.'
  if (path.startsWith('trash/')) return 'Restore the file from the trash before assigning it.'
  const t = p.target
  if (!t) return 'No assignment target.'
  if (t.type === 'product') {
    if (!t.productId || typeof t.productId !== 'string') return 'Choose a product.'
    return null
  }
  if (t.type === 'site_setting') {
    if (!isHeroSlotKey(t.key)) return 'Unknown site image slot.'
    return null
  }
  return 'Unknown target type.'
}
