import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { rePreparePack } from '@/lib/commercial/communicationPacks'
import { UUID_RE, vString } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// POST /api/admin/communications/:id/re-prepare
// Creates pack v2 (fresh render, CURRENT attachment versions) and
// supersedes the old pack. Full chain remains visible.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cs = await requireCommercial('communication_prepare')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const confirmationUrl = vString(body?.confirmationUrl, 'confirmationUrl', { max: 500 })
  const confirmation = confirmationUrl ? { url: confirmationUrl } : null

  const res = await rePreparePack(id, cs.user, confirmation)
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.json({ pack: res.data }, { status: 201 })
}
