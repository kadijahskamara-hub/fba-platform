import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial, requireAnyCommercial } from '@/lib/commercial/permissions'
import { listPeriods, createPeriod } from '@/lib/commercial/accountingPeriods'
import { vString, vDate, ValidationError } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// GET — list accounting periods (accounting_view or period_manage).
export async function GET() {
  const cs = await requireAnyCommercial(['accounting_view', 'period_manage'])
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json({ periods: await listPeriods() })
}

// POST — create a period (Ultra-only: period_manage).
export async function POST(req: NextRequest) {
  const cs = await requireCommercial('period_manage')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const label = vString(body.label, 'label', { required: true, max: 60 })!
    const startsOn = vDate(body.startsOn, 'startsOn', true)!
    const endsOn = vDate(body.endsOn, 'endsOn', true)!
    const res = await createPeriod({ label, startsOn, endsOn, actor: cs.user })
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ period: res.data.period }, { status: 201 })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
