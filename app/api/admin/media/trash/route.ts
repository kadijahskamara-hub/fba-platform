import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { isMediaBucket, trashPath, type MediaBucket } from '@/lib/mediaShared'

// ============================================================
// POST /api/admin/media/trash (Sprint 23)
//
// Soft delete: moves the object under trash/<original-path>.
// Nothing in the Media Library is ever hard-deleted. Restore is
// the same call with { restore: true }.
// ============================================================

export async function POST(req: NextRequest) {
  if (!(await isStaff())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  let body: { bucket?: string; path?: string; restore?: boolean }
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const path = (body.path ?? '').trim()
  if (!isMediaBucket(body.bucket)) return NextResponse.json({ success: false, error: 'Unknown bucket.' }, { status: 400 })
  if (!path || path.includes('..') || path.startsWith('/')) {
    return NextResponse.json({ success: false, error: 'Invalid path.' }, { status: 400 })
  }
  const bucket: MediaBucket = body.bucket

  let from: string, to: string
  if (body.restore) {
    if (!path.startsWith('trash/')) return NextResponse.json({ success: false, error: 'Not a trashed file.' }, { status: 400 })
    from = path; to = path.slice('trash/'.length)
  } else {
    if (path.startsWith('trash/')) return NextResponse.json({ success: false, error: 'Already in the trash.' }, { status: 400 })
    from = path; to = trashPath(path)
  }

  const { error } = await supabaseAdmin.storage.from(bucket).move(from, to)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: { bucket, path: to } })
}
