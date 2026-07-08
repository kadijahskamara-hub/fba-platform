import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPipelineSession } from '@/lib/pipelineAuth'

// PATCH /api/admin/proformas/:id/items/:itemId — edit a line item
export async function PATCH(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const session = await getPipelineSession()
  if (!session) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const map: Record<string, string> = {
    name: 'name', description: 'description', quantity: 'quantity', unitPrice: 'unit_price',
    manufacturerId: 'manufacturer_id', manufacturerName: 'manufacturer_name',
    selectedFinish: 'selected_finish', selectedFabric: 'selected_fabric', selectedSize: 'selected_size',
    notes: 'notes', sortOrder: 'sort_order',
  }
  const updates: Record<string, unknown> = {}
  for (const [camel, snake] of Object.entries(map)) {
    if (body[camel] !== undefined) updates[snake] = body[camel]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('proforma_line_items').update(updates).eq('id', params.itemId).eq('proforma_id', params.id).select().single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  await supabaseAdmin.from('proformas').update({ updated_at: new Date().toISOString() }).eq('id', params.id)
  return NextResponse.json({ success: true, data })
}

// DELETE /api/admin/proformas/:id/items/:itemId
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const session = await getPipelineSession()
  if (!session) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const { error } = await supabaseAdmin
    .from('proforma_line_items').delete().eq('id', params.itemId).eq('proforma_id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  await supabaseAdmin.from('proformas').update({ updated_at: new Date().toISOString() }).eq('id', params.id)
  return NextResponse.json({ success: true })
}
