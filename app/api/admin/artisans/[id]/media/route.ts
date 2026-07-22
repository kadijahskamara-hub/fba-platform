import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff, getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { UPLOAD_MIME_EXT, MAX_UPLOAD_BYTES } from '@/lib/mediaShared'

// ============================================================
// Artisan / manufacturer media (final amendments §2)
//
// POST   — direct multipart upload into the artisan-media bucket
//          under {artisan_id}/{generated_name}. Oversized images
//          are resized to a sane maximum edge with sharp.
// DELETE — remove a previously uploaded object, guarded so it
//          only touches this artisan's folder and never deletes
//          a file still referenced by another record.
//
// The bucket is public-read; every mutation goes through these
// staff-authenticated routes (service role) — client code never
// writes to Storage directly.
// ============================================================

const BUCKET = 'artisan-media'
const MAX_EDGE = 2400 // px — larger sources are downscaled

async function loadArtisan(id: string) {
  const { data } = await supabaseAdmin
    .from('artisans')
    .select('id, name, profile_image, gallery_images')
    .eq('id', id)
    .single()
  return data
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const artisan = await loadArtisan(params.id)
  if (!artisan) return NextResponse.json({ success: false, error: 'Artisan not found' }, { status: 404 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 })

  const ext = UPLOAD_MIME_EXT[file.type]
  if (!ext) return NextResponse.json({ success: false, error: 'Only JPG, PNG, WEBP, AVIF or GIF images are accepted.' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ success: false, error: 'Images must be 15 MB or smaller.' }, { status: 400 })
  }

  let buffer = Buffer.from(await file.arrayBuffer())
  let contentType = file.type

  // Optimise oversized sources (skip GIFs to preserve animation).
  if (file.type !== 'image/gif') {
    try {
      const meta = await sharp(buffer).metadata()
      if ((meta.width ?? 0) > MAX_EDGE || (meta.height ?? 0) > MAX_EDGE) {
        buffer = Buffer.from(await sharp(buffer)
          .rotate() // respect EXIF orientation
          .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
          .toBuffer())
      }
    } catch {
      return NextResponse.json({ success: false, error: 'That file could not be read as an image.' }, { status: 400 })
    }
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const path = `${params.id}/${stamp}-${randomBytes(6).toString('hex')}.${ext}`

  const { error: upErr } = await supabaseAdmin.storage.from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false })
  if (upErr) return NextResponse.json({ success: false, error: upErr.message }, { status: 500 })

  const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  await logAudit({
    actor: await getSession(), action: 'artisan.media_uploaded', entityType: 'artisan', entityId: params.id,
    after: { path, bytes: buffer.length },
  })

  return NextResponse.json({ success: true, data: { path, url, bytes: buffer.length } })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const artisan = await loadArtisan(params.id)
  if (!artisan) return NextResponse.json({ success: false, error: 'Artisan not found' }, { status: 404 })

  const body = await req.json().catch(() => null) as { url?: string } | null
  const url = body?.url
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ success: false, error: 'url is required' }, { status: 400 })
  }

  // Only objects inside THIS artisan's folder of the artisan-media
  // bucket are deletable here. External/legacy URLs are simply not
  // storage objects — removing the reference is enough for those.
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) {
    return NextResponse.json({ success: true, data: { deleted: false, reason: 'external-url' } })
  }
  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
  if (!path.startsWith(`${params.id}/`) || path.includes('..')) {
    return NextResponse.json({ success: false, error: 'That file does not belong to this artisan.' }, { status: 400 })
  }

  // Shared-reference guard: never delete an object that another
  // artisan record still points at.
  const { data: others } = await supabaseAdmin
    .from('artisans')
    .select('id, profile_image, gallery_images')
    .neq('id', params.id)
    .or(`profile_image.eq.${url},gallery_images.cs.{"${url}"}`)
  if ((others ?? []).length > 0) {
    return NextResponse.json({ success: true, data: { deleted: false, reason: 'still-referenced' } })
  }

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path])
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  await logAudit({
    actor: await getSession(), action: 'artisan.media_deleted', entityType: 'artisan', entityId: params.id,
    before: { path },
  })

  return NextResponse.json({ success: true, data: { deleted: true } })
}
