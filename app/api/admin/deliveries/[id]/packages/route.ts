import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { ValidationError, vUuid, vString } from '@/lib/commercial/validation'

// POST /api/admin/deliveries/:id/packages — add a parcel /
// consignment reference (multiple parcels per shipment).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')
    const body = await req.json()
    const { data: del } = await supabaseAdmin.from('deliveries')
      .select('id, dispatch_status').eq('id', params.id).single()
    if (!del) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    if (['delivered', 'partially_delivered', 'returned'].includes(del.dispatch_status)) {
      return NextResponse.json({ success: false, error: 'This delivery is already complete.' }, { status: 409 })
    }

    const { data: pkg, error } = await supabaseAdmin.from('delivery_packages').insert({
      delivery_id: params.id,
      reference: vString(body.reference, 'reference', { max: 200 }),
      description: vString(body.description, 'description', { max: 500 }),
      weight: vString(body.weight, 'weight', { max: 60 }),
      dimensions: vString(body.dimensions, 'dimensions', { max: 120 }),
    }).select('id').single()
    if (error || !pkg) return NextResponse.json({ success: false, error: error?.message ?? 'Insert failed' }, { status: 500 })
    return NextResponse.json({ success: true, data: { id: pkg.id } })
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Could not add the package.' }, { status: 500 })
  }
}
