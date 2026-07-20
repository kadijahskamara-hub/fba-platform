import 'server-only'
import { supabaseAdmin } from './supabase'
import {
  storagePathFromPublicUrl, collectImageUrls, isKeepFile, KEEP_FILE,
  type MediaBucket,
} from './mediaShared'

// ============================================================
// Media Library — server-side listing + usage map (Sprint 23).
// ============================================================

export type MediaObject = {
  path: string
  name: string
  size: number | null
  updatedAt: string | null
  mimetype: string | null
  url: string
}

export type MediaUsage = { kind: 'product_image' | 'product_media' | 'site_setting'; label: string; href: string }

const LIST_PAGE = 100
const MAX_OBJECTS = 2000
const MAX_DEPTH = 4

// Supabase storage list() is per-folder; walk folders breadth-first
// with hard caps so a runaway bucket can't hang the request.
export async function listBucketObjects(bucket: MediaBucket, opts?: { prefix?: string; includeTrash?: boolean }): Promise<MediaObject[]> {
  const out: MediaObject[] = []
  const queue: Array<{ prefix: string; depth: number }> = [{ prefix: opts?.prefix ?? '', depth: 0 }]

  while (queue.length && out.length < MAX_OBJECTS) {
    const { prefix, depth } = queue.shift()!
    let offset = 0
    for (;;) {
      const { data, error } = await supabaseAdmin.storage.from(bucket)
        .list(prefix, { limit: LIST_PAGE, offset, sortBy: { column: 'updated_at', order: 'desc' } })
      if (error || !data) break
      for (const entry of data) {
        const full = prefix ? `${prefix}/${entry.name}` : entry.name
        const isFolder = !entry.id && !entry.metadata
        if (isFolder) {
          if (depth < MAX_DEPTH && (opts?.includeTrash || entry.name !== 'trash')) {
            queue.push({ prefix: full, depth: depth + 1 })
          }
          continue
        }
        if (!opts?.includeTrash && full.startsWith('trash/')) continue
        if (isKeepFile(entry.name)) continue
        const meta = (entry.metadata ?? {}) as Record<string, unknown>
        out.push({
          path: full,
          name: entry.name,
          size: typeof meta.size === 'number' ? meta.size : null,
          updatedAt: (entry.updated_at as string | null) ?? null,
          mimetype: typeof meta.mimetype === 'string' ? meta.mimetype : null,
          url: supabaseAdmin.storage.from(bucket).getPublicUrl(full).data.publicUrl,
        })
        if (out.length >= MAX_OBJECTS) break
      }
      if (data.length < LIST_PAGE || out.length >= MAX_OBJECTS) break
      offset += LIST_PAGE
    }
  }
  return out
}

// Single-level folder listing for the browser UI: immediate sub-folders
// + files of one folder only (much cheaper than the deep walk).
export async function listFolder(bucket: MediaBucket, folder: string): Promise<{ folders: string[]; files: MediaObject[] }> {
  const folders: string[] = []
  const files: MediaObject[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabaseAdmin.storage.from(bucket)
      .list(folder, { limit: LIST_PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error || !data) break
    for (const entry of data) {
      const isFolder = !entry.id && !entry.metadata
      if (isFolder) {
        if (!(folder === '' && entry.name === 'trash')) folders.push(entry.name)
        continue
      }
      if (isKeepFile(entry.name)) continue
      const full = folder ? `${folder}/${entry.name}` : entry.name
      const meta = (entry.metadata ?? {}) as Record<string, unknown>
      files.push({
        path: full,
        name: entry.name,
        size: typeof meta.size === 'number' ? meta.size : null,
        updatedAt: (entry.updated_at as string | null) ?? null,
        mimetype: typeof meta.mimetype === 'string' ? meta.mimetype : null,
        url: supabaseAdmin.storage.from(bucket).getPublicUrl(full).data.publicUrl,
      })
    }
    if (data.length < LIST_PAGE) break
    offset += LIST_PAGE
  }
  return { folders, files }
}

// Total bytes stored in a bucket (trash included — it still occupies space).
export async function bucketUsageBytes(bucket: MediaBucket): Promise<number> {
  const objects = await listBucketObjects(bucket, { includeTrash: true })
  return objects.reduce((sum, o) => sum + (o.size ?? 0), 0)
}

// Create an (implicit) folder by writing its .keep placeholder.
export async function createFolderPlaceholder(bucket: MediaBucket, folderPath: string): Promise<string | null> {
  const { error } = await supabaseAdmin.storage.from(bucket)
    .upload(`${folderPath}/${KEEP_FILE}`, Buffer.alloc(0), { contentType: 'application/octet-stream', upsert: false })
  if (!error) return null
  if (/already exists|Duplicate/i.test(error.message)) return 'That folder already exists.'
  return error.message
}

// Where is each image used? Keyed by `${bucket}/${path}` for storage
// objects and by the raw URL for external images (e.g. Pexels).
export async function buildUsageMap(): Promise<Map<string, MediaUsage[]>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const map = new Map<string, MediaUsage[]>()
  const add = (key: string, usage: MediaUsage) => {
    if (!key) return
    const arr = map.get(key) ?? []
    arr.push(usage)
    map.set(key, arr)
  }
  const keyFor = (url: string): string => {
    const parsed = storagePathFromPublicUrl(url, supabaseUrl)
    return parsed ? `${parsed.bucket}/${parsed.path}` : url
  }

  const [{ data: products }, { data: media }, { data: settings }] = await Promise.all([
    supabaseAdmin.from('products').select('id, name, slug, images'),
    supabaseAdmin.from('product_media').select('product_id, storage_path, is_active, products(name, slug)'),
    supabaseAdmin.from('site_settings').select('key, value'),
  ])

  for (const p of products ?? []) {
    const imgs = Array.isArray(p.images) ? (p.images as string[]) : []
    for (const url of imgs) {
      add(keyFor(url), { kind: 'product_image', label: `Product: ${p.name}`, href: `/admin/products/${p.slug}` })
    }
  }

  for (const m of media ?? []) {
    if (m.is_active === false) continue
    const prod = (m.products as unknown as { name?: string; slug?: string } | null)
    add(`product-media/${m.storage_path}`, {
      kind: 'product_media',
      label: `Product media: ${prod?.name ?? 'product'}`,
      href: prod?.slug ? `/admin/products/${prod.slug}` : '/admin/products',
    })
  }

  // site_settings values are JSON blobs; scan string leaves for image URLs.
  for (const s of settings ?? []) {
    for (const url of collectImageUrls(s.value)) {
      add(keyFor(url), { kind: 'site_setting', label: `Site setting: ${s.key}`, href: '/admin/settings' })
    }
  }

  return map
}
