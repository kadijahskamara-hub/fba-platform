import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { convertToCommercialOrder } from '@/lib/commercial/purchaseOrders'
import { ValidationError, vUuid, vString } from '@/lib/commercial/validation'

// GET /api/admin/commercial-orders — list sales orders
export async function GET(req: NextRequest) {
  const cs = await requireCommercial('quote_pipeline_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const status = req.nextUrl.searchParams.get('status')
  let q = supabaseAdmin
    .from('commercial_orders')
    .select('id, order_number, status, currency, source_quote_number, source_revision_number, accepted_at, created_at, client_snapshot, project_snapshot, source:proformas!commercial_orders_source_proforma_id_fkey(id, proforma_number, quote_number), pos:purchase_orders(id, purchase_order_number, status)')
    .order('created_at', { ascending: false })
  if (status && status !== 'all') q = q.eq('status', status) as typeof q

  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: 'Could not load orders.' }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

// POST /api/admin/commercial-orders — explicit conversion from an
// issued/approved quote or pro forma. Never mutates the source.
export async function POST(req: NextRequest) {
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const proformaId = vUuid(body.proformaId, 'proformaId')
    let overrideReason: string | null = null
    if (body.duplicateOverrideReason !== undefined && body.duplicateOverrideReason !== null) {
      if (!cs.isUltraAdmin) {
        return NextResponse.json({ success: false, error: 'Only Ultra Admin may override duplicate-order prevention.' }, { status: 403 })
      }
      overrideReason = vString(body.duplicateOverrideReason, 'duplicateOverrideReason', { required: true, max: 500 })
    }

    const result = await convertToCommercialOrder({ proformaId, actor: cs.user, duplicateOverrideReason: overrideReason })
    if ('error' in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, data: result.order })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 })
  }
}
