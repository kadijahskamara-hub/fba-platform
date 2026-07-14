import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { logAudit } from '@/lib/audit'
import { UUID_RE } from '@/lib/commercial/validation'

// POST /api/admin/deliveries/:id/downloaded — download audit log
// (fired by the document toolbar; must never block the download).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_view')
  if (!cs) return NextResponse.json({ success: false }, { status: 403 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ success: false }, { status: 400 })

  let audience = 'client'
  try {
    const body = await req.json()
    if (typeof body.audience === 'string') audience = body.audience.slice(0, 20)
  } catch { /* ignore */ }

  await logAudit({
    actor: cs.user, action: 'commercial.delivery_note_downloaded', entityType: 'delivery',
    entityId: params.id, after: { audience },
  })
  return NextResponse.json({ success: true })
}
