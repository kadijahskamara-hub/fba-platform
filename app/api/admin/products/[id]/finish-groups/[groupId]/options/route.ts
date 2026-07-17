import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { ValidationError, vUuid, vString, vNumber, vBoolean } from '@/lib/commercial/validation'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; groupId: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.groupId, 'groupId')
    const body = await req.json().catch(() => ({}))
    const finishId = vUuid(body.finishId, 'finishId')
    const isDefault = vBoolean(body.isDefault, 'isDefault', false)

    const { data: group } = await supabaseAdmin.from('product_finish_groups')
      .select('id').eq('id', params.groupId).eq('product_id', params.id).single()
    if (!group) return NextResponse.json({ success: false, error: 'Finish group not found' }, { status: 404 })

    if (isDefault) {
      await supabaseAdmin.from('product_finish_options')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('finish_group_id', params.groupId)
    }
    const { data, error } = await supabaseAdmin.from('product_finish_options').insert({
      finish_group_id: params.groupId,
      finish_id: finishId,
      is_available: vBoolean(body.isAvailable, 'isAvailable', true),
      is_default: isDefault,
      price_adjustment: vNumber(body.priceAdjustment, 'priceAdjustment', { min: -1000000, max: 1000000 }) ?? 0,
      lead_time_adjustment_weeks: vNumber(body.leadTimeAdjustmentWeeks, 'leadTimeAdjustmentWeeks', { min: -52, max: 52 }) ?? 0,
      sku_suffix: vString(body.skuSuffix, 'skuSuffix', { max: 40 }),
      description_override: vString(body.descriptionOverride, 'descriptionOverride', { max: 1000 }),
      sort_order: vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 }) ?? 0,
    }).select('*, finish:finishes(id, name, code, hex_colour, texture_storage_path)').single()
    if (error) {
      const msg = error.code === '23505' ? 'That finish is already an option in this group.' : error.message
      return NextResponse.json({ success: false, error: msg }, { status: 500 })
    }
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
