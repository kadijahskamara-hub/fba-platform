import { NextRequest, NextResponse } from 'next/server'
import { requireAnyCommercial } from '@/lib/commercial/permissions'
import { cancelRefund } from '@/lib/commercial/refunds'
import { UUID_RE, vString, ValidationError } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// POST — cancel a pending/approved refund (recorder or approver).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cs = await requireAnyCommercial(['refund_record', 'refund_approve'])
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const body = await req.json().catch(() => ({}))
    const reason = vString(body.reason, 'reason', { required: true, max: 2000 })!
    const res = await cancelRefund(id, cs.user, reason)
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
