import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { vUuid } from '@/lib/commercial/validation'

const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_BYTES = 15 * 1024 * 1024
const ROLES = ['primary', 'gallery', 'swatch', 'texture', 'lifestyle', 'dimension_drawing', 'tear_sheet_hero']

function publicMediaUrl(path: string): string {
  const { data } = supabaseAdmin.storage.from('product-media').getPublicUrl(path)
  return data.publicUrl
}

// GET — structured media for a product (with public URLs).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }
  const { data, error } = await supabaseAdmin.from('product_media')
    .select('*').eq('product_id', params.id).eq('is_active', true)
    .order('sort_order').order('created_at')
  if (error) return NextResponse.json({ success: false, error: 'Query failed' }, { status: 500 })
  const rows = (data ?? []).map(m => ({ ...m, url: publicMediaUrl(m.storage_path as string) }))
  return NextResponse.json({ success: true, data: rows })
}

// POST multipart { file, mediaRole?, altText?, finishOptionId? } — upload.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 })
  const ext = MIME_EXT[file.type]
  if (!ext) return NextResponse.json({ success: false, error: 'Only JPG, PNG or WEBP images are accepted.' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ success: false, error: 'Images must be 15 MB or smaller.' }, { status: 400 })

  const roleRaw = (form?.get('mediaRole') as string | null) ?? 'gallery'
  const mediaRole = ROLES.includes(roleRaw) ? roleRaw : 'gallery'
  const altText = ((form?.get('altText') as string | null) ?? '').slice(0, 300) || null
  const finishOptionRaw = form?.get('finishOptionId') as string | null
  let finishOptionId: string | null = null
  if (finishOptionRaw) { try { finishOptionId = vUuid(finishOptionRaw, 'finishOptionId') } catch { finishOptionId = null } }

  const { data: product } = await supabaseAdmin.from('products').select('id, name').eq('id', params.id).single()
  if (!product) return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 })

  const path = `products/${params.id}/${randomBytes(8).toString('hex')}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await supabaseAdmin.storage.from('product-media')
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ success: false, error: upErr.message }, { status: 500 })

  const { data: existing } = await supabaseAdmin.from('product_media')
    .select('id').eq('product_id', params.id).eq('is_active', true).limit(1)
  const isFirst = !existing || existing.length === 0

  const { data: maxSort } = await supabaseAdmin.from('product_media')
    .select('sort_order').eq('product_id', params.id).order('sort_order', { ascending: false }).limit(1)
  const nextSort = ((maxSort?.[0]?.sort_order as number) ?? -1) + 1

  const { data, error } = await supabaseAdmin.from('product_media').insert({
    product_id: params.id,
    finish_option_id: finishOptionId,
    storage_path: path,
    media_role: isFirst && mediaRole === 'gallery' ? 'primary' : mediaRole,
    alt_text: altText ?? product.name,
    sort_order: nextSort,
    is_primary: isFirst,   // first active image becomes the primary
  }).select().single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: { ...data, url: publicMediaUrl(path) } })
}
