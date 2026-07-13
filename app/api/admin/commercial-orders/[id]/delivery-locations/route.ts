import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { logAudit } from '@/lib/audit'
import { ValidationError, vUuid, vString } from '@/lib/commercial/validation'

// POST /api/admin/commercial-orders/:id/delivery-locations
// Create a site address (+ optional contacts) for an order.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')
    const body = await req.json()

    const { data: order } = await supabaseAdmin
      .from('commercial_orders').select('id, order_number').eq('id', params.id).single()
    if (!order) return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })

    const { data: loc, error } = await supabaseAdmin.from('delivery_locations').insert({
      commercial_order_id: params.id,
      label: vString(body.label, 'label', { max: 120 }) ?? 'Main site',
      address_line1: vString(body.addressLine1, 'addressLine1', { max: 300 }),
      address_line2: vString(body.addressLine2, 'addressLine2', { max: 300 }),
      city: vString(body.city, 'city', { max: 120 }),
      region: vString(body.region, 'region', { max: 120 }),
      postcode: vString(body.postcode, 'postcode', { max: 30 }),
      country: vString(body.country, 'country', { max: 120 }),
      access_notes: vString(body.accessNotes, 'accessNotes', { max: 4000 }),
      created_by: cs.user.id,
    }).select('id').single()
    if (error || !loc) return NextResponse.json({ success: false, error: error?.message ?? 'Insert failed' }, { status: 500 })

    // Optional contacts array (allowlisted fields only — no mass assignment).
    const contacts = Array.isArray(body.contacts) ? body.contacts.slice(0, 10) : []
    for (const c of contacts) {
      const name = vString(c?.name, 'contact name', { max: 200 })
      if (!name) continue
      await supabaseAdmin.from('site_contacts').insert({
        delivery_location_id: loc.id,
        name,
        role: vString(c?.role, 'contact role', { max: 120 }),
        phone: vString(c?.phone, 'contact phone', { max: 60 }),
        email: vString(c?.email, 'contact email', { max: 200 }),
        is_primary: Boolean(c?.isPrimary),
        notes: vString(c?.notes, 'contact notes', { max: 1000 }),
      })
    }

    await logAudit({
      actor: cs.user, action: 'commercial.delivery_location_created', entityType: 'delivery_location',
      entityId: loc.id, after: { orderNumber: order.order_number, label: body.label ?? 'Main site' },
    })
    return NextResponse.json({ success: true, data: { id: loc.id } })
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Could not create the location.' }, { status: 500 })
  }
}
