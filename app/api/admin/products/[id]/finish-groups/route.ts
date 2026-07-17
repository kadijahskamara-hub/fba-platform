import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { ValidationError, vUuid, vUuidOrNull, vString, vNumber, vBoolean } from '@/lib/commercial/validation'

// Finish groups for one product, with their options and library finishes.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }
  const { data, error } = await supabaseAdmin
    .from('product_finish_groups')
    .select(`*, material_type:material_types(id, name, slug),
      options:product_finish_options(*, finish:finishes(id, name, code, hex_colour, texture_storage_path, material_type_id, is_active))`)
    .eq('product_id', params.id)
    .order('sort_order')
  if (error) return NextResponse.json({ success: false, error: 'Query failed' }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.id, 'id')
    const body = await req.json().catch(() => ({}))
    const label = vString(body.label, 'label', { required: true, max: 120 })!
    const key = (vString(body.key, 'key', { max: 120 }) ?? label)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const { data, error } = await supabaseAdmin.from('product_finish_groups').insert({
      product_id: params.id,
      label,
      key,
      material_type_id: vUuidOrNull(body.materialTypeId, 'materialTypeId'),
      required: vBoolean(body.required, 'required', false),
      help_text: vString(body.helpText, 'helpText', { max: 500 }),
      sort_order: vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 }) ?? 0,
    }).select().single()
    if (error) {
      const msg = error.code === '23505' ? `A group with the key "${key}" already exists on this product.` : error.message
      return NextResponse.json({ success: false, error: msg }, { status: 500 })
    }
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
