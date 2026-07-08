import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPipelineSession } from '@/lib/pipelineAuth'

// POST /api/admin/proformas/:id/items — add a line item (catalogue or bespoke)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getPipelineSession()
  if (!session) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  // Next sort_order = current max + 1
  const { data: existing } = await supabaseAdmin
    .from('proforma_line_items').select('sort_order').eq('proforma_id', params.id)
    .order('sort_order', { ascending: false }).limit(1)
  const nextSort = ((existing?.[0]?.sort_order as number) ?? -1) + 1

  const row: Record<string, unknown> = {
    proforma_id: params.id,
    quantity:    body.quantity ?? 1,
    currency:    body.currency || 'GBP',
    selected_finish: body.selectedFinish || null,
    selected_fabric: body.selectedFabric || null,
    selected_size:   body.selectedSize || null,
    notes:       body.notes || null,
    sort_order:  nextSort,
  }

  if (body.productId) {
    // Catalogue product: snapshot name, seed unit price from trade price,
    // tag manufacturer from the product's artisan.
    const { data: product } = await supabaseAdmin
      .from('products').select('name, trade_price, artisan_id').eq('id', body.productId).single()
    row.product_id      = body.productId
    row.is_bespoke      = false
    row.name            = body.name || product?.name || 'Item'
    row.manufacturer_id = body.manufacturerId ?? product?.artisan_id ?? null
    row.unit_price      = body.unitPrice ?? product?.trade_price ?? null
    row.description     = body.description || null
  } else {
    // Bespoke / off-catalogue line: manual name, manufacturer, price.
    if (!body.name?.trim()) {
      return NextResponse.json({ success: false, error: 'A name is required for a bespoke item.' }, { status: 400 })
    }
    row.product_id       = null
    row.is_bespoke       = true
    row.name             = body.name.trim()
    row.description      = body.description || null
    row.manufacturer_id  = body.manufacturerId || null
    row.manufacturer_name = body.manufacturerName || null
    row.unit_price       = body.unitPrice ?? null
  }

  const { data, error } = await supabaseAdmin.from('proforma_line_items').insert(row).select().single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  await supabaseAdmin.from('proformas').update({ updated_at: new Date().toISOString() }).eq('id', params.id)
  return NextResponse.json({ success: true, data })
}
