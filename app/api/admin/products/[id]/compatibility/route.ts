import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { ValidationError, vUuid, vString, vBoolean } from '@/lib/commercial/validation'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }
  const { data, error } = await supabaseAdmin
    .from('finish_compatibility_rules')
    .select(`*,
      source:product_finish_options!finish_compatibility_rules_source_finish_option_id_fkey(id, finish:finishes(name), group:product_finish_groups(label)),
      target:product_finish_options!finish_compatibility_rules_target_finish_option_id_fkey(id, finish:finishes(name), group:product_finish_groups(label))`)
    .eq('product_id', params.id).eq('is_active', true)
    .order('created_at')
  if (error) return NextResponse.json({ success: false, error: 'Query failed' }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.id, 'id')
    const body = await req.json().catch(() => ({}))
    const source = vUuid(body.sourceFinishOptionId, 'sourceFinishOptionId')
    const target = vUuid(body.targetFinishOptionId, 'targetFinishOptionId')
    if (source === target) return NextResponse.json({ success: false, error: 'A rule must reference two different options.' }, { status: 400 })
    const { data, error } = await supabaseAdmin.from('finish_compatibility_rules').insert({
      product_id: params.id,
      source_finish_option_id: source,
      target_finish_option_id: target,
      is_allowed: vBoolean(body.isAllowed, 'isAllowed', false),
      explanation: vString(body.explanation, 'explanation', { max: 500 }),
    }).select().single()
    if (error) {
      const msg = error.code === '23505' ? 'A rule for this pair already exists.' : error.message
      return NextResponse.json({ success: false, error: msg }, { status: 500 })
    }
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
