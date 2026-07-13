import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { markPackSent } from '@/lib/commercial/communicationPacks'
import { UUID_RE, vString, ValidationError } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// POST /api/admin/communications/:id/mark-sent
// body: { sentVia, note? } — records who/when/"sent via" (atomic fn).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cs = await requireCommercial('communication_mark_sent')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const body = await req.json().catch(() => ({}))
    const sentVia = vString(body.sentVia, 'sentVia', { required: true, max: 200 })!
    const note = vString(body.note, 'note', { max: 2000 })
    const res = await markPackSent(id, cs.user, sentVia, note)
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
