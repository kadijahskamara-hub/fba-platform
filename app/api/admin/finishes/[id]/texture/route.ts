import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
}
const MAX_BYTES = 10 * 1024 * 1024

// POST multipart { file } — upload a texture/swatch image for a finish.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 })
  const ext = MIME_EXT[file.type]
  if (!ext) return NextResponse.json({ success: false, error: 'Only JPG, PNG or WEBP images are accepted.' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ success: false, error: 'Images must be 10 MB or smaller.' }, { status: 400 })

  const { data: finish } = await supabaseAdmin.from('finishes').select('id').eq('id', params.id).single()
  if (!finish) return NextResponse.json({ success: false, error: 'Finish not found' }, { status: 404 })

  const path = `finishes/${params.id}/${randomBytes(8).toString('hex')}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await supabaseAdmin.storage.from('product-media')
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ success: false, error: upErr.message }, { status: 500 })

  const { data, error } = await supabaseAdmin.from('finishes')
    .update({ texture_storage_path: path, updated_at: new Date().toISOString() })
    .eq('id', params.id).select().single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const { data: urlData } = supabaseAdmin.storage.from('product-media').getPublicUrl(path)
  return NextResponse.json({ success: true, data: { finish: data, url: urlData.publicUrl } })
}
