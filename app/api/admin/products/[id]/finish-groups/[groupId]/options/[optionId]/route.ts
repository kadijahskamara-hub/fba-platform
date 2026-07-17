import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { ValidationError, vUuid, vString, vNumber, vBoolean } from '@/lib/commercial/validation'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; groupId: string; optionId: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.optionId, 'optionId')
    const body = await req.json().catch(() => ({}))
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.isAvailable !== undefined) update.is_available = vBoolean(body.isAvailable, 'isAvailable', true)
    if (body.priceAdjustment !== undefined) update.price_adjustment = vNumber(body.priceAdjustment, 'priceAdjustment', { min: -1000000, max: 1000000 }) ?? 0
    if (body.leadTimeAdjustmentWeeks !== undefined) update.lead_time_adjustment_weeks = vNumber(body.leadTimeAdjustmentWeeks, 'leadTimeAdjustmentWeeks', { min: -52, max: 52 }) ?? 0
    if (body.skuSuffix !== undefined) update.sku_suffix = vString(body.skuSuffix, 'skuSuffix', { max: 40 })
    if (body.descriptionOverride !== undefined) update.description_override = vString(body.descriptionOverride, 'descriptionOverride', { max: 1000 })
    if (body.sortOrder !== undefined) update.sort_order = vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 })
    if (body.isDefault !== undefined) {
      const isDefault = vBoolean(body.isDefault, 'isDefault', false)
      if (isDefault) {
        await supabaseAdmin.from('product_finish_options')
          .update({ is_default: false, updated_at: new Date().toISOString() })
          .eq('finish_group_id', params.groupId)
      }
      update.is_default = isDefault
    }
    const { data, error } = await supabaseAdmin.from('product_finish_options')
      .update(update).eq('id', params.optionId).eq('finish_group_id', params.groupId)
      .select('*, finish:finishes(id, name, code, hex_colour, texture_storage_path)').single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; groupId: string; optionId: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.optionId, 'optionId') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }
  const { error } = await supabaseAdmin.from('product_finish_options')
    .delete().eq('id', params.optionId).eq('finish_group_id', params.groupId)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
