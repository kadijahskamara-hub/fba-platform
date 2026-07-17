import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { vUuid } from '@/lib/commercial/validation'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; ruleId: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.ruleId, 'ruleId') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }
  const { error } = await supabaseAdmin.from('finish_compatibility_rules')
    .delete().eq('id', params.ruleId).eq('product_id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
