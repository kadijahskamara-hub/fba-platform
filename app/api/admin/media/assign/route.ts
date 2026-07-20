import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import {
  validateAssignParams, HERO_SLOTS, type AssignTarget, type MediaBucket,
} from '@/lib/mediaShared'
import { vUuid } from '@/lib/commercial/validation'

// ============================================================
// Media Library assignment (Sprint 23.1)
//
// GET  — assignment targets for the picker UI: products (id,
//        name, sku) + the hero slots with their current image.
// POST — assign a stored image:
//   • product:      the object is COPIED into
//     product-media/products/<id>/… and a product_media row is
//     inserted (gallery; primary if it's the product's first) —
//     same semantics as the product page uploader.
//   • site_setting: the slot's site_settings value is set to
//     { url, alt } pointing at the image (key allowlisted to
//     the hero slots).
// ============================================================

export async function GET() {
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const [{ data: products }, { data: settings }] = await Promise.all([
    supabaseAdmin.from('products').select('id, name, sku, slug').order('name').limit(1000),
    supabaseAdmin.from('site_settings').select('key, value').in('key', HERO_SLOTS.map(s => s.key)),
  ])

  const current = new Map((settings ?? []).map(s => [s.key, (s.value as { url?: string } | null)?.url ?? '']))
  return NextResponse.json({
    success: true,
    data: {
      products: products ?? [],
      heroSlots: HERO_SLOTS.map(s => ({ ...s, currentUrl: current.get(s.key) ?? '' })),
    },
  })
}

export async function POST(req: NextRequest) {
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  let body: { bucket?: string; path?: string; target?: AssignTarget }
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const invalid = validateAssignParams(body)
  if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 })
  const bucket = body.bucket as MediaBucket
  const path = body.path as string
  const target = body.target as AssignTarget

  const publicUrl = supabaseAdmin.storage.from(bucket).getPublicUrl(path).data.publicUrl

  if (target.type === 'site_setting') {
    // Preserve the slot's existing alt text if there is one.
    const { data: existing } = await supabaseAdmin
      .from('site_settings').select('value').eq('key', target.key).maybeSingle()
    const alt = (existing?.value as { alt?: string } | null)?.alt ?? ''
    const { error } = await supabaseAdmin
      .from('site_settings')
      .upsert({ key: target.key, value: { url: publicUrl, alt }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    const label = HERO_SLOTS.find(s => s.key === target.key)?.label ?? target.key
    return NextResponse.json({ success: true, data: { assigned: label } })
  }

  // Product: copy the object into the product's folder, insert media row.
  let productId: string
  try { productId = vUuid(target.productId, 'productId') } catch {
    return NextResponse.json({ success: false, error: 'Invalid product.' }, { status: 400 })
  }
  const { data: product } = await supabaseAdmin.from('products').select('id, name').eq('id', productId).single()
  if (!product) return NextResponse.json({ success: false, error: 'Product not found.' }, { status: 404 })

  const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(bucket).download(path)
  if (dlErr || !blob) return NextResponse.json({ success: false, error: 'Source image not found.' }, { status: 404 })
  const buffer = Buffer.from(await blob.arrayBuffer())

  const ext = (path.split('.').pop() ?? 'jpg').toLowerCase()
  const destPath = `products/${productId}/${randomBytes(8).toString('hex')}.${ext}`
  const contentType = blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`
  const { error: upErr } = await supabaseAdmin.storage.from('product-media')
    .upload(destPath, buffer, { contentType, upsert: false })
  if (upErr) return NextResponse.json({ success: false, error: upErr.message }, { status: 500 })

  // Mirror the product-page uploader: first active image becomes primary.
  const { data: existingMedia } = await supabaseAdmin.from('product_media')
    .select('id').eq('product_id', productId).eq('is_active', true).limit(1)
  const isFirst = !existingMedia || existingMedia.length === 0

  const { data: maxSort } = await supabaseAdmin.from('product_media')
    .select('sort_order').eq('product_id', productId).order('sort_order', { ascending: false }).limit(1)
  const nextSort = ((maxSort?.[0]?.sort_order as number) ?? -1) + 1

  const { error: insErr } = await supabaseAdmin.from('product_media').insert({
    product_id: productId,
    storage_path: destPath,
    media_role: isFirst ? 'primary' : 'gallery',
    alt_text: product.name,
    sort_order: nextSort,
    is_primary: isFirst,
  })
  if (insErr) return NextResponse.json({ success: false, error: insErr.message }, { status: 500 })

  return NextResponse.json({ success: true, data: { assigned: `Product: ${product.name}` } })
}
