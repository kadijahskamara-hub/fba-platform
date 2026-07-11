import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { logAudit } from '@/lib/audit'
import { UUID_RE } from '@/lib/commercial/validation'

// POST /api/admin/purchase-orders/:id/downloaded — download-event log
// (fired by the PO document's Download button).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })

  await logAudit({
    actor: cs.user, action: 'commercial.po_downloaded', entityType: 'purchase_order', entityId: params.id,
  })
  return NextResponse.json({ success: true })
}
