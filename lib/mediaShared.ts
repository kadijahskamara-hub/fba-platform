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

// ---------- Resizable crop frame (Sprint 24.2) ----------
// The crop window itself is draggable from its 8 handles, Wix-style.
// Anchoring: the opposite edge/corner stays put; pure-edge drags with
// a locked aspect keep the perpendicular axis centred.
export type CropFrame = { x: number; y: number; w: number; h: number }
export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const CROP_MIN_SIZE = 60

export function resizeCropFrame(
  frame: CropFrame, handle: CropHandle, dx: number, dy: number,
  opts: { aspect?: number | null; minSize?: number; boundsW: number; boundsH: number }
): CropFrame {
  const aspect = opts.aspect && opts.aspect > 0 ? opts.aspect : null
  const min = opts.minSize ?? CROP_MIN_SIZE
  const { boundsW, boundsH } = opts
  const hasN = handle.includes('n'), hasS = handle.includes('s')
  const hasE = handle.includes('e'), hasW = handle.includes('w')
  const right = frame.x + frame.w
  const bottom = frame.y + frame.h
  const cx = frame.x + frame.w / 2
  const cy = frame.y + frame.h / 2

  let w = frame.w, h = frame.h
  if (aspect) {
    // Driver axis: horizontal when an E/W side is held, else vertical.
    if (hasE || hasW) { w = hasE ? frame.w + dx : frame.w - dx; h = w / aspect }
    else { h = hasS ? frame.h + dy : frame.h - dy; w = h * aspect }
  } else {
    if (hasE) w = frame.w + dx
    if (hasW) w = frame.w - dx
    if (hasS) h = frame.h + dy
    if (hasN) h = frame.h - dy
  }

  // Room available on each axis given the anchor.
  const roomW = (hasE || hasW) ? (hasW ? right : boundsW - frame.x) : 2 * Math.min(cx, boundsW - cx)
  const roomH = (hasN || hasS) ? (hasN ? bottom : boundsH - frame.y) : 2 * Math.min(cy, boundsH - cy)

  if (aspect) {
    const wMin = Math.max(min, min * aspect)
    const wCap = Math.max(wMin, Math.min(roomW, roomH * aspect))
    w = Math.min(Math.max(w, wMin), wCap)
    h = w / aspect
  } else {
    w = Math.min(Math.max(w, min), Math.max(min, roomW))
    h = Math.min(Math.max(h, min), Math.max(min, roomH))
  }

  let x = frame.x, y = frame.y
  if (hasW) x = right - w
  else if (!hasE) x = cx - w / 2
  if (hasN) y = bottom - h
  else if (!hasS) y = cy - h / 2

  x = Math.min(Math.max(0, x), Math.max(0, boundsW - w))
  y = Math.min(Math.max(0, y), Math.max(0, boundsH - h))
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

// Fit a frame of the given aspect into the canvas, centred.
export function fitCropFrame(aspect: number, boundsW: number, boundsH: number): CropFrame {
  const r = aspect > 0 ? aspect : 1
  let w = boundsW, h = w / r
  if (h > boundsH) { h = boundsH; w = h * r }
  return { x: Math.round((boundsW - w) / 2), y: Math.round((boundsH - h) / 2), w: Math.round(w), h: Math.round(h) }
}

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

// ---------- Shared types (Phase 2 picker rebuild) ----------
export type MediaUsageRef = { kind: string; label: string; href: string }
export type MediaLibraryFile = {
  bucket: string
  path: string
  name: string
  size: number | null
  updatedAt: string | null
  mimetype: string | null
  url: string
  usedIn: MediaUsageRef[]
}

// ---------- Folders ----------
// Storage folders are implicit prefixes; an empty folder exists as a
// 0-byte `.keep` placeholder which listings always hide.
export const KEEP_FILE = '.keep'
export const MAX_FOLDER_DEPTH = 3
export const RESERVED_FOLDERS = ['trash'] // never creatable/browsable as normal folders

export function isKeepFile(name: string): boolean {
  return name === KEEP_FILE
}

// Folder segment: lowercase letters, digits, hyphens; 1–40 chars.
export function validateFolderName(name: string): string | null {
  if (!name || !/^[a-z0-9-]{1,40}$/.test(name)) {
    return 'Folder names can use lowercase letters, numbers and hyphens (max 40 characters).'
  }
  if (RESERVED_FOLDERS.includes(name)) return `"${name}" is a reserved name.`
  return null
}

// A browseable folder path is 0–MAX_FOLDER_DEPTH valid segments.
export function validateFolderPath(folder: string): string | null {
  if (folder === '') return null
  const segments = folder.split('/')
  if (segments.length > MAX_FOLDER_DEPTH) return `Folders can be at most ${MAX_FOLDER_DEPTH} levels deep.`
  for (const s of segments) {
    // Existing structural folders (e.g. products/<uuid>) may contain
    // characters outside the creatable set; allow safe path chars but
    // never traversal or empties.
    if (!s || s === '.' || s === '..' || !/^[a-zA-Z0-9._-]+$/.test(s)) return 'Invalid folder path.'
  }
  if (segments[0] === 'trash') return 'The trash is not a browseable folder.'
  return null
}

export function joinPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name
}

export function parentFolder(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

export function fileName(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? path : path.slice(i + 1)
}

export function isEditedCopy(name: string): boolean {
  return /-edit-[0-9a-f]{6}\.[a-zA-Z0-9]+$/.test(name)
}

// ---------- Sorting & filtering ----------
export type MediaSortKey = 'newest' | 'oldest' | 'name' | 'largest'
export const MEDIA_SORTS: Array<{ key: MediaSortKey; label: string }> = [
  { key: 'newest',  label: 'Newest first' },
  { key: 'oldest',  label: 'Oldest first' },
  { key: 'name',    label: 'Name A–Z' },
  { key: 'largest', label: 'Largest first' },
]

export function sortMediaFiles<T extends { name: string; size: number | null; updatedAt: string | null }>(
  files: T[], sort: MediaSortKey
): T[] {
  const ts = (f: T) => (f.updatedAt ? new Date(f.updatedAt).getTime() : 0)
  const out = [...files]
  switch (sort) {
    case 'oldest':  out.sort((a, b) => ts(a) - ts(b)); break
    case 'name':    out.sort((a, b) => a.name.localeCompare(b.name)); break
    case 'largest': out.sort((a, b) => (b.size ?? 0) - (a.size ?? 0)); break
    case 'newest':
    default:        out.sort((a, b) => ts(b) - ts(a)); break
  }
  return out
}

export type MediaTypeFilter = '' | 'jpg' | 'png' | 'webp' | 'avif' | 'gif'
export const MEDIA_TYPE_FILTERS: Array<{ key: MediaTypeFilter; label: string }> = [
  { key: '',     label: 'All types' },
  { key: 'jpg',  label: 'JPG' },
  { key: 'png',  label: 'PNG' },
  { key: 'webp', label: 'WEBP' },
  { key: 'avif', label: 'AVIF' },
  { key: 'gif',  label: 'GIF' },
]

export function matchesTypeFilter(name: string, filter: MediaTypeFilter): boolean {
  if (!filter) return true
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (filter === 'jpg') return ext === 'jpg' || ext === 'jpeg'
  return ext === filter
}

export type MediaUsedFilter = '' | 'used' | 'unused'

export function matchesUsedFilter(usedCount: number, filter: MediaUsedFilter): boolean {
  if (filter === 'used') return usedCount > 0
  if (filter === 'unused') return usedCount === 0
  return true
}

// ---------- Storage bar ----------
export const DEFAULT_STORAGE_CAP_MB = 1024

export function storageBarLevel(usedBytes: number, capMb: number): 'ok' | 'warn' | 'critical' {
  const cap = capMb > 0 ? capMb * 1024 * 1024 : DEFAULT_STORAGE_CAP_MB * 1024 * 1024
  const ratio = usedBytes / cap
  if (ratio >= 0.95) return 'critical'
  if (ratio >= 0.8) return 'warn'
  return 'ok'
}

// Cache-busted display URL: replacing an original keeps its path, so
// thumbnails would otherwise show the stale cached version.
export function cacheBustedUrl(url: string, updatedAt: string | null | undefined): string {
  if (!url || !updatedAt) return url
  const t = Date.parse(updatedAt)
  if (!Number.isFinite(t)) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${t}`
}

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// ---------- Uploads ----------
export const UPLOAD_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif',
}
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

// ---------- Assignment targets ----------
// Site slots an image can be assigned to. Values are { url, alt }
// in site_settings — every key rendered through HeroImageUploader.
export const HERO_SLOTS: Array<{ key: string; label: string }> = [
  { key: 'home_hero_image',       label: 'Homepage hero' },
  { key: 'the_edit_hero_image',   label: 'The Edit hero' },
  { key: 'collection_hero_image', label: 'FBA Collection hero' },
  { key: 'artisans_hero_image',   label: 'Artisans hero' },
  { key: 'journal_hero_image',    label: 'Journal hero' },
  { key: 'about_hero_image',      label: 'About hero' },
  { key: 'home_pillars_image',    label: 'Homepage — “What We Do” band' },
  { key: 'about_maker_image',     label: 'About — maker studio image' },
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
