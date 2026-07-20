import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import {
  validateEditParams, editedCopyPath, rotatedDims,
  type MediaEditParams, type MediaBucket,
} from '@/lib/mediaShared'

// ============================================================
// POST /api/admin/media/edit (Sprint 23)
//
// Server-side image edit: rotate → crop (extract) → resize,
// processed with sharp. The result is ALWAYS saved as a new copy
// next to the original (`…-edit-xxxxxx.ext`) — originals are
// never overwritten. Crop rect is expressed in the ROTATED
// image's pixel space (the client previews the same bounding
// box, so coordinates line up exactly).
// ============================================================

export const maxDuration = 60

const OUT_FORMATS: Record<string, 'jpeg' | 'png' | 'webp'> = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp' }

export async function POST(req: NextRequest) {
  if (!(await isStaff())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  let body: MediaEditParams
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const invalid = validateEditParams(body)
  if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 })
  const bucket = body.bucket as MediaBucket

  // Download the original.
  const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(bucket).download(body.path)
  if (dlErr || !blob) {
    return NextResponse.json({ success: false, error: 'Original image not found.' }, { status: 404 })
  }
  const input = Buffer.from(await blob.arrayBuffer())

  try {
    const meta = await sharp(input).metadata()
    if (!meta.width || !meta.height) {
      return NextResponse.json({ success: false, error: 'Not a valid image.' }, { status: 400 })
    }

    // Rotate first (white background fill for JPEG, transparent otherwise),
    // then clamp the crop to the rotated bounding box.
    const ext = (body.path.split('.').pop() ?? 'jpg').toLowerCase()
    const format = OUT_FORMATS[ext] ?? 'jpeg'
    const background = format === 'jpeg' ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0, alpha: 0 }

    let pipe = sharp(input).rotate(body.rotate, { background })
    const rot = rotatedDims(meta.width, meta.height, body.rotate)
    const left   = Math.max(0, Math.min(body.crop.left, rot.w - 1))
    const top    = Math.max(0, Math.min(body.crop.top,  rot.h - 1))
    const width  = Math.max(1, Math.min(body.crop.width,  rot.w - left))
    const height = Math.max(1, Math.min(body.crop.height, rot.h - top))
    pipe = pipe.extract({ left, top, width, height })

    if (body.outputWidth || body.outputHeight) {
      pipe = pipe.resize(body.outputWidth ?? null, body.outputHeight ?? null, { fit: 'fill' })
    }

    const output = await pipe.toFormat(format, format === 'jpeg' ? { quality: 90 } : undefined).toBuffer()

    // Save as a NEW copy — never overwrite the original.
    const newPath = editedCopyPath(body.path, randomBytes(3).toString('hex'))
    const { error: upErr } = await supabaseAdmin.storage.from(bucket)
      .upload(newPath, output, { contentType: `image/${format}`, upsert: false })
    if (upErr) return NextResponse.json({ success: false, error: upErr.message }, { status: 500 })

    const url = supabaseAdmin.storage.from(bucket).getPublicUrl(newPath).data.publicUrl
    return NextResponse.json({ success: true, data: { bucket, path: newPath, url, bytes: output.length } })
  } catch {
    return NextResponse.json({ success: false, error: 'Image processing failed.' }, { status: 500 })
  }
}
