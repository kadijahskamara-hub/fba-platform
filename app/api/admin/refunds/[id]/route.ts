import { NextRequest, NextResponse } from 'next/server'
import { requireAnyCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { UUID_RE } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// GET — a single refund with its source context.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cs = await requireAnyCommercial(['accounting_view', 'refund_record', 'refund_approve'])
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { data: refund } = await supabaseAdmin.from('refunds').select('*').eq('id', id).single()
  if (!refund) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ refund })
}
