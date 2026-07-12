import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { issuePurchaseOrder } from '@/lib/commercial/purchaseOrders'
import { ValidationError, vUuid } from '@/lib/commercial/validation'

// POST /api/admin/purchase-orders/:id/issue
//
// Freezes an immutable snapshot, locks the PO, revokes any previous
// acknowledgement tokens and mints a fresh single-purpose token. The
// raw token is returned ONCE in this response (only its hash is
// stored) — the preparer shares the link with the manufacturer.
// Send-status is recorded honestly as approved_not_sent: no email is
// dispatched by this action (email automation is a later sprint).
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try { vUuid(params.id, 'id') } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof ValidationError ? e.message : 'Invalid id' }, { status: 400 })
  }

  const result = await issuePurchaseOrder({ poId: params.id, actor: cs.user })
  if ('error' in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status })

  return NextResponse.json({
    success: true,
    data: {
      documentNumber: result.documentNumber,
      snapshotId: result.snapshotId,
      acknowledgementUrl: result.ackUrl,
    },
  })
}
