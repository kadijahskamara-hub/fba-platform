import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { ValidationError, vUuid, vString, vNumber, vEnum } from '@/lib/commercial/validation'

const VISIBILITY = ['public', 'trade', 'internal'] as const

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; rowId: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.rowId, 'rowId')
    const body = await req.json().catch(() => ({}))
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.label !== undefined) update.label = vString(body.label, 'label', { required: true, max: 120 })
    if (body.value !== undefined) update.value = vString(body.value, 'value', { required: true, max: 1000 })
    if (body.unit !== undefined) update.unit = vString(body.unit, 'unit', { max: 40 })
    if (body.visibility !== undefined) update.visibility = vEnum(body.visibility, 'visibility', VISIBILITY) ?? 'public'
    if (body.sortOrder !== undefined) update.sort_order = vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 })
    const { data, error } = await supabaseAdmin.from('product_spec_rows')
      .update(update).eq('id', params.rowId).eq('product_id', params.id).select().single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; rowId: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.rowId, 'rowId') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }
  const { error } = await supabaseAdmin.from('product_spec_rows')
    .delete().eq('id', params.rowId).eq('product_id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
