import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { ValidationError, vUuid, vUuidOrNull, vString, vNumber, vEnum, vBoolean } from '@/lib/commercial/validation'

const ROLES = ['primary', 'gallery', 'swatch', 'texture', 'lifestyle', 'dimension_drawing', 'tear_sheet_hero'] as const

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; mediaId: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.mediaId, 'mediaId')
    const body = await req.json().catch(() => ({}))
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.altText !== undefined) update.alt_text = vString(body.altText, 'altText', { max: 300 })
    if (body.caption !== undefined) update.caption = vString(body.caption, 'caption', { max: 500 })
    if (body.mediaRole !== undefined) update.media_role = vEnum(body.mediaRole, 'mediaRole', ROLES) ?? 'gallery'
    if (body.sortOrder !== undefined) update.sort_order = vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 })
    if (body.finishOptionId !== undefined) update.finish_option_id = vUuidOrNull(body.finishOptionId, 'finishOptionId')
    if (body.isPrimary !== undefined && vBoolean(body.isPrimary, 'isPrimary', false)) {
      // one active primary per product (partial unique index) — unset first
      await supabaseAdmin.from('product_media')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('product_id', params.id).eq('is_primary', true)
      update.is_primary = true
    }
    const { data, error } = await supabaseAdmin.from('product_media')
      .update(update).eq('id', params.mediaId).eq('product_id', params.id).select().single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}

// DELETE = archive (storage object retained; harmless orphan policy
// matches issued-document PDFs).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; mediaId: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.mediaId, 'mediaId') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }
  const { error } = await supabaseAdmin.from('product_media')
    .update({ is_active: false, is_primary: false, updated_at: new Date().toISOString() })
    .eq('id', params.mediaId).eq('product_id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
