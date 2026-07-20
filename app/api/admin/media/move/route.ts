import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { buildUsageMap } from '@/lib/mediaLibrary'
import {
  isMediaBucket, validateFolderPath, fileName, joinPath, type MediaBucket,
} from '@/lib/mediaShared'

// ============================================================
// POST /api/admin/media/move (Phase 2)
// Moves a file into another folder in the SAME bucket.
//
// v1 rule: files that are referenced anywhere (product images,
// product_media, site settings) cannot be moved — moving would
// break those references. The UI explains this; unused files
// move freely. Body: { bucket, path, toFolder }
// ============================================================

export async function POST(req: NextRequest) {
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  let body: { bucket?: string; path?: string; toFolder?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!isMediaBucket(body.bucket)) return NextResponse.json({ success: false, error: 'Unknown bucket.' }, { status: 400 })
  const bucket = body.bucket as MediaBucket
  const path = (body.path ?? '').trim()
  if (!path || path.includes('..') || path.startsWith('/') || path.startsWith('trash/')) {
    return NextResponse.json({ success: false, error: 'Invalid path.' }, { status: 400 })
  }
  const toFolder = (body.toFolder ?? '').trim()
  const folderErr = validateFolderPath(toFolder)
  if (folderErr) return NextResponse.json({ success: false, error: folderErr }, { status: 400 })

  const dest = joinPath(toFolder, fileName(path))
  if (dest === path) return NextResponse.json({ success: false, error: 'The file is already in that folder.' }, { status: 400 })

  // In-use files stay put (v1) — references would break.
  const usage = await buildUsageMap()
  const usedIn = usage.get(`${bucket}/${path}`) ?? []
  if (usedIn.length > 0) {
    return NextResponse.json({
      success: false,
      error: `This image is used in ${usedIn.length} place${usedIn.length > 1 ? 's' : ''} and can't be moved without breaking those references. Assign a different image there first.`,
    }, { status: 409 })
  }

  const { error } = await supabaseAdmin.storage.from(bucket).move(path, dest)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: { bucket, path: dest } })
}
