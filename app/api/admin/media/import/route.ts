import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { isAllowedImportUrl, isMediaBucket, type MediaBucket } from '@/lib/mediaShared'

// ============================================================
// POST /api/admin/media/import (Sprint 23)
//
// Copies an external image (Pexels, or our own Supabase host)
// into a storage bucket so it can be edited — external URLs
// can't be edited in place. SSRF-guarded: https only, host
// allowlist (images.pexels.com + our Supabase project), no
// redirects followed, size + content-type enforced.
// ============================================================

const MAX_BYTES = 25 * 1024 * 1024
const CT_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif',
}

export async function POST(req: NextRequest) {
  if (!(await isStaff())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  let body: { url?: string; bucket?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const url = (body.url ?? '').trim()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!isAllowedImportUrl(url, supabaseUrl)) {
    return NextResponse.json({ success: false, error: 'Only images.pexels.com or our own storage can be imported.' }, { status: 400 })
  }
  const bucket: MediaBucket = isMediaBucket(body.bucket) ? body.bucket : 'site-assets'

  try {
    // redirect: 'error' — a redirect off the allowlisted host must fail.
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return NextResponse.json({ success: false, error: `Source responded ${res.status}.` }, { status: 502 })

    const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const ext = CT_EXT[ct]
    if (!ext) return NextResponse.json({ success: false, error: 'The URL is not an image.' }, { status: 400 })

    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > MAX_BYTES) return NextResponse.json({ success: false, error: 'Image is larger than 25 MB.' }, { status: 400 })

    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length > MAX_BYTES) return NextResponse.json({ success: false, error: 'Image is larger than 25 MB.' }, { status: 400 })

    const stamp = new Date().toISOString().slice(0, 10)
    const path = `imports/${stamp}-${randomBytes(6).toString('hex')}.${ext}`
    const { error: upErr } = await supabaseAdmin.storage.from(bucket)
      .upload(path, buffer, { contentType: ct, upsert: false })
    if (upErr) return NextResponse.json({ success: false, error: upErr.message }, { status: 500 })

    const publicUrl = supabaseAdmin.storage.from(bucket).getPublicUrl(path).data.publicUrl
    return NextResponse.json({ success: true, data: { bucket, path, url: publicUrl, bytes: buffer.length } })
  } catch {
    return NextResponse.json({ success: false, error: 'Could not fetch the image.' }, { status: 502 })
  }
}
