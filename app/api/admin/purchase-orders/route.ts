import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'

// GET /api/admin/purchase-orders — list (optional ?status= / ?manufacturerId=)
export async function GET(req: NextRequest) {
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const status = req.nextUrl.searchParams.get('status')
  const manufacturerId = req.nextUrl.searchParams.get('manufacturerId')

  let q = supabaseAdmin
    .from('purchase_orders')
    .select('id, purchase_order_number, revision_number, status, approval_status, margin_at_risk, supplier_currency, grand_total, order_date, required_by_date, issued_at, acknowledged_at, manufacturer:artisans(id, name), commercial_order:commercial_orders(id, order_number, client_snapshot)')
    .order('created_at', { ascending: false })
  if (status && status !== 'all') q = q.eq('status', status) as typeof q
  if (manufacturerId) q = q.eq('manufacturer_id', manufacturerId) as typeof q

  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: 'Could not load purchase orders.' }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}
