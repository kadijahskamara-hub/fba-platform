import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { ValidationError, vUuid, vUuidOrNull, vString, vNumber, vBoolean } from '@/lib/commercial/validation'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; groupId: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.groupId, 'groupId')
    const body = await req.json().catch(() => ({}))
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.label !== undefined) update.label = vString(body.label, 'label', { required: true, max: 120 })
    if (body.materialTypeId !== undefined) update.material_type_id = vUuidOrNull(body.materialTypeId, 'materialTypeId')
    if (body.required !== undefined) update.required = vBoolean(body.required, 'required', false)
    if (body.helpText !== undefined) update.help_text = vString(body.helpText, 'helpText', { max: 500 })
    if (body.sortOrder !== undefined) update.sort_order = vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 })
    if (body.isActive !== undefined) update.is_active = vBoolean(body.isActive, 'isActive', true)
    const { data, error } = await supabaseAdmin.from('product_finish_groups')
      .update(update).eq('id', params.groupId).eq('product_id', params.id).select().single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; groupId: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.groupId, 'groupId') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }
  const { error } = await supabaseAdmin.from('product_finish_groups')
    .delete().eq('id', params.groupId).eq('product_id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
