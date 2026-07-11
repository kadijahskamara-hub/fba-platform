import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { generateDraftPo } from '@/lib/commercial/purchaseOrders'
import { ValidationError, vUuid } from '@/lib/commercial/validation'

// POST /api/admin/commercial-orders/:id/purchase-orders
//   { manufacturerId } → draft PO from this manufacturer's open allocations.
// One manufacturer per PO; mixed currencies are refused; allocations with
// missing cost/currency block generation (nothing is fabricated).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')
    const body = await req.json()
    const manufacturerId = vUuid(body.manufacturerId, 'manufacturerId')

    const result = await generateDraftPo({ commercialOrderId: params.id, manufacturerId, actor: cs.user })
    if ('error' in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, data: result.po })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 })
  }
}
