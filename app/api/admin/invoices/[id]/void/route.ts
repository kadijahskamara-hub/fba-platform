import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { voidInvoice } from '@/lib/commercial/invoiceControls'
import { UUID_RE, vString, ValidationError } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// POST — controlled void of an issued invoice (invoice_void; SQL blocks
// it when payments/credits exist or the tax period is locked).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cs = await requireCommercial('invoice_void')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const body = await req.json().catch(() => ({}))
    const reason = vString(body.reason, 'reason', { required: true, max: 2000 })!
    const res = await voidInvoice(id, reason, cs.user)
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ ok: true, invoiceNumber: res.data.invoiceNumber })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
