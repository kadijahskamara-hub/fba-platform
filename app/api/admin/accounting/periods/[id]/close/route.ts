import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { closePeriod } from '@/lib/commercial/accountingPeriods'
import { UUID_RE } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// POST — close a period (Ultra-only). Freezes documents dated inside it.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cs = await requireCommercial('period_manage')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const res = await closePeriod(id, cs.user)
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.json({ ok: true, label: res.data.label })
}
