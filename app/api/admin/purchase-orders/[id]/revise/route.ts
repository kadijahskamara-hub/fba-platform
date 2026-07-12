import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { revisePurchaseOrder } from '@/lib/commercial/purchaseOrders'
import { ValidationError, vUuid, vString } from '@/lib/commercial/validation'

// POST /api/admin/purchase-orders/:id/revise  { reason }
//
// Issued POs are never mutated: this re-opens the working record as the
// next revision, preserves the original issued snapshot verbatim,
// revokes the previous acknowledgement token, and requires approval
// again where relevant. The supplier must be re-issued the new revision.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  let reason: string
  try {
    vUuid(params.id, 'id')
    const body = await req.json()
    reason = vString(body.reason, 'reason', { required: true, max: 500 })!
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof ValidationError ? e.message : 'Invalid request' }, { status: 400 })
  }

  const result = await revisePurchaseOrder({ poId: params.id, reason, actor: cs.user })
  if ('error' in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  return NextResponse.json({
    success: true,
    data: { revision: result.revision },
    notice: 'Previous revision preserved. The old acknowledgement link is now invalid — reissue the PO and share the new link with the supplier.',
  })
}
