import { NextRequest, NextResponse } from 'next/server'
import { isStaff } from '@/lib/auth'
import { createFolderPlaceholder } from '@/lib/mediaLibrary'
import {
  isMediaBucket, validateFolderName, validateFolderPath,
  MAX_FOLDER_DEPTH, type MediaBucket,
} from '@/lib/mediaShared'

// ============================================================
// POST /api/admin/media/folder (Phase 2)
// Creates a folder (storage prefix) by writing a hidden .keep
// placeholder — e.g. product folders to organise product images.
// Body: { bucket, parent: '' | 'existing/folder', name: 'chairs' }
// ============================================================

export async function POST(req: NextRequest) {
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  let body: { bucket?: string; parent?: string; name?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!isMediaBucket(body.bucket)) return NextResponse.json({ success: false, error: 'Unknown bucket.' }, { status: 400 })
  const parent = (body.parent ?? '').trim()
  const parentErr = validateFolderPath(parent)
  if (parentErr) return NextResponse.json({ success: false, error: parentErr }, { status: 400 })

  const name = (body.name ?? '').trim().toLowerCase()
  const nameErr = validateFolderName(name)
  if (nameErr) return NextResponse.json({ success: false, error: nameErr }, { status: 400 })

  const depth = parent ? parent.split('/').length + 1 : 1
  if (depth > MAX_FOLDER_DEPTH) {
    return NextResponse.json({ success: false, error: `Folders can be at most ${MAX_FOLDER_DEPTH} levels deep.` }, { status: 400 })
  }

  const folderPath = parent ? `${parent}/${name}` : name
  const err = await createFolderPlaceholder(body.bucket as MediaBucket, folderPath)
  if (err) return NextResponse.json({ success: false, error: err }, { status: 400 })

  return NextResponse.json({ success: true, data: { bucket: body.bucket, folder: folderPath } })
}
