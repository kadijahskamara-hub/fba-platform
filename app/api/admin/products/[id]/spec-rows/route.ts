import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { ValidationError, vUuid, vString, vNumber, vEnum } from '@/lib/commercial/validation'

const VISIBILITY = ['public', 'trade', 'internal'] as const

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }
  const { data, error } = await supabaseAdmin.from('product_spec_rows')
    .select('*').eq('product_id', params.id).order('sort_order')
  if (error) return NextResponse.json({ success: false, error: 'Query failed' }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.id, 'id')
    const body = await req.json().catch(() => ({}))
    const { data: maxSort } = await supabaseAdmin.from('product_spec_rows')
      .select('sort_order').eq('product_id', params.id).order('sort_order', { ascending: false }).limit(1)
    const { data, error } = await supabaseAdmin.from('product_spec_rows').insert({
      product_id: params.id,
      label: vString(body.label, 'label', { required: true, max: 120 }),
      value: vString(body.value, 'value', { required: true, max: 1000 }),
      unit: vString(body.unit, 'unit', { max: 40 }),
      visibility: vEnum(body.visibility, 'visibility', VISIBILITY) ?? 'public',
      sort_order: vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 })
        ?? ((maxSort?.[0]?.sort_order as number) ?? -1) + 1,
    }).select().single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
