import { NextRequest, NextResponse } from 'next/server'
import { isStaff } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import {
  listBucketObjects, listFolder, buildUsageMap, bucketUsageBytes,
} from '@/lib/mediaLibrary'
import {
  isMediaBucket, MEDIA_BUCKETS, validateFolderPath,
  sortMediaFiles, matchesTypeFilter, matchesUsedFilter,
  DEFAULT_STORAGE_CAP_MB,
  type MediaBucket, type MediaLibraryFile,
  type MediaSortKey, type MediaTypeFilter, type MediaUsedFilter,
} from '@/lib/mediaShared'

// ============================================================
// GET /api/admin/media — Media Library listing (Phase 2 rebuild).
//
// Views:
//   ?bucket=&folder=       single-level folder browse (default)
//   ?bucket=&search=       deep search within the bucket
//                          (file names AND usage labels)
//   ?view=recents          20 most recent files across all buckets
//   ?bucket=&trash=1       trash contents for the bucket
// Modifiers: sort= newest|oldest|name|largest · type= jpg|png|…
//            used= used|unused · stats=1 adds storage usage + cap
// ============================================================

const RECENTS_LIMIT = 20

export async function GET(req: NextRequest) {
  if (!(await isStaff())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') ?? 'browse'
  const bucketRaw = searchParams.get('bucket') ?? MEDIA_BUCKETS[0]
  if (view !== 'recents' && !isMediaBucket(bucketRaw)) {
    return NextResponse.json({ success: false, error: 'Unknown bucket.' }, { status: 400 })
  }
  const search = (searchParams.get('search') ?? '').trim().toLowerCase()
  const showTrash = searchParams.get('trash') === '1'
  const sort = (searchParams.get('sort') ?? 'newest') as MediaSortKey
  const type = (searchParams.get('type') ?? '') as MediaTypeFilter
  const used = (searchParams.get('used') ?? '') as MediaUsedFilter
  const folder = searchParams.get('folder') ?? ''
  const folderErr = validateFolderPath(folder)
  if (folderErr) return NextResponse.json({ success: false, error: folderErr }, { status: 400 })

  try {
    const bucket = bucketRaw as MediaBucket
    const usage = await buildUsageMap()
    const withUsage = (b: string) =>
      <T extends { path: string }>(o: T): T & { bucket: string; usedIn: MediaLibraryFile['usedIn'] } =>
        ({ ...o, bucket: b, usedIn: usage.get(`${b}/${o.path}`) ?? [] })

    let files: MediaLibraryFile[] = []
    let folders: string[] = []

    if (view === 'recents') {
      const perBucket = await Promise.all(
        MEDIA_BUCKETS.map(async b => (await listBucketObjects(b)).map(withUsage(b)))
      )
      files = perBucket.flat()
      files = sortMediaFiles(files, 'newest').slice(0, RECENTS_LIMIT)
    } else if (showTrash) {
      const objects = await listBucketObjects(bucket, { includeTrash: true, prefix: 'trash' })
      files = objects.map(withUsage(bucket))
    } else if (search) {
      const objects = await listBucketObjects(bucket)
      files = objects.map(withUsage(bucket)).filter(f =>
        f.path.toLowerCase().includes(search) ||
        f.usedIn.some(u => u.label.toLowerCase().includes(search))
      )
    } else {
      const level = await listFolder(bucket, folder)
      folders = level.folders
      files = level.files.map(withUsage(bucket))
    }

    // Modifiers apply to every view.
    files = files.filter(f => matchesTypeFilter(f.path.split('/').pop() ?? '', type))
    files = files.filter(f => matchesUsedFilter(f.usedIn.length, used))
    if (view !== 'recents') files = sortMediaFiles(files, sort)

    // Optional storage stats for the sidebar bar.
    let stats: { usedBytes: number; capMb: number } | undefined
    if (searchParams.get('stats') === '1') {
      const [bytes, { data: capSetting }] = await Promise.all([
        Promise.all(MEDIA_BUCKETS.map(b => bucketUsageBytes(b))).then(a => a.reduce((s, n) => s + n, 0)),
        supabaseAdmin.from('site_settings').select('value').eq('key', 'media_storage_cap_mb').maybeSingle(),
      ])
      const capRaw = Number((capSetting?.value as { mb?: number } | null)?.mb)
      stats = { usedBytes: bytes, capMb: Number.isFinite(capRaw) && capRaw > 0 ? capRaw : DEFAULT_STORAGE_CAP_MB }
    }

    return NextResponse.json({ success: true, data: files, folders, buckets: MEDIA_BUCKETS, stats })
  } catch {
    return NextResponse.json({ success: false, error: 'Could not list media.' }, { status: 500 })
  }
}
