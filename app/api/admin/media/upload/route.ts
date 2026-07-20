import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { isMediaBucket, UPLOAD_MIME_EXT, MAX_UPLOAD_BYTES, type MediaBucket } from '@/lib/mediaShared'

// ============================================================
// POST /api/admin/media/upload (Sprint 23.1)
//
// Direct multipart upload into a Media Library bucket (replaces
// the removed URL import). Generated path under uploads/ —
// never overwrites anything (upsert: false).
// ============================================================

export async function POST(req: NextRequest) {
  if (!(await isStaff())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 })

  const ext = UPLOAD_MIME_EXT[file.type]
  if (!ext) return NextResponse.json({ success: false, error: 'Only JPG, PNG, WEBP, AVIF or GIF images are accepted.' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ success: false, error: 'Images must be 15 MB or smaller.' }, { status: 400 })
  }

  const bucketRaw = form?.get('bucket') as string | null
  const bucket: MediaBucket = isMediaBucket(bucketRaw) ? bucketRaw : 'site-assets'

  const stamp = new Date().toISOString().slice(0, 10)
  const path = `uploads/${stamp}-${randomBytes(6).toString('hex')}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await supabaseAdmin.storage.from(bucket)
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ success: false, error: upErr.message }, { status: 500 })

  const url = supabaseAdmin.storage.from(bucket).getPublicUrl(path).data.publicUrl
  return NextResponse.json({ success: true, data: { bucket, path, url, bytes: buffer.length } })
}
