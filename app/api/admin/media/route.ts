import { NextRequest, NextResponse } from 'next/server'
import { isStaff } from '@/lib/auth'
import { listBucketObjects, buildUsageMap } from '@/lib/mediaLibrary'
import { isMediaBucket, MEDIA_BUCKETS } from '@/lib/mediaShared'

// ============================================================
// GET /api/admin/media?bucket=product-media&search=&trash=1
// Media Library listing (Sprint 23): objects in the selected
// public bucket with public URLs plus a usage map showing where
// each image appears (products.images, product_media rows,
// site_settings hero/JSON values).
// ============================================================

export async function GET(req: NextRequest) {
  if (!(await isStaff())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const bucketRaw = searchParams.get('bucket') ?? MEDIA_BUCKETS[0]
  if (!isMediaBucket(bucketRaw)) {
    return NextResponse.json({ success: false, error: 'Unknown bucket.' }, { status: 400 })
  }
  const search = (searchParams.get('search') ?? '').trim().toLowerCase()
  const showTrash = searchParams.get('trash') === '1'

  try {
    const [objects, usage] = await Promise.all([
      listBucketObjects(bucketRaw, {
        includeTrash: showTrash,
        prefix: showTrash ? 'trash' : undefined,
      }),
      buildUsageMap(),
    ])

    const filtered = search ? objects.filter(o => o.path.toLowerCase().includes(search)) : objects
    const withUsage = filtered.map(o => ({
      ...o,
      bucket: bucketRaw,
      usedIn: usage.get(`${bucketRaw}/${o.path}`) ?? [],
    }))

    return NextResponse.json({ success: true, data: withUsage, buckets: MEDIA_BUCKETS })
  } catch {
    return NextResponse.json({ success: false, error: 'Could not list media.' }, { status: 500 })
  }
}
