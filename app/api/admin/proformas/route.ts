import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPipelineSession } from '@/lib/pipelineAuth'
import { logAudit } from '@/lib/audit'

// GET /api/admin/proformas — list (optional ?stage= filter)
export async function GET(req: NextRequest) {
  const session = await getPipelineSession()
  if (!session) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const stage = req.nextUrl.searchParams.get('stage')

  let query = supabaseAdmin
    .from('proformas')
    .select('*, items:proforma_line_items(id, name, quantity, unit_price, manufacturer_id, manufacturer_name, is_bespoke), contact:users!proformas_contact_user_id_fkey(id, first_name, last_name, email)')
    .order('created_at', { ascending: false })

  if (stage && stage !== 'all') query = query.eq('stage', stage) as typeof query

  const { data, error } = await query
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

// POST /api/admin/proformas — create a proforma (optionally seeded from a quote request)
export async function POST(req: NextRequest) {
  const session = await getPipelineSession()
  if (!session) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  // Insert header — proforma_number auto-generates in the DB.
  const { data: proforma, error } = await supabaseAdmin
    .from('proformas')
    .insert({
      quote_request_id: body.quoteRequestId || null,
      contact_user_id:  body.contactUserId || null,
      client_name:      body.clientName || null,
      client_email:     body.clientEmail || null,
      client_company:   body.clientCompany || null,
      project_name:     body.projectName || null,
      project_location: body.projectLocation || null,
      currency:         body.currency || 'GBP',
      stage:            'draft',
      notes:            body.notes || null,
      admin_notes:      body.adminNotes || null,
      created_by:       session.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  // If seeded from a quote request, copy its items into line items, seeding
  // unit price from each product's trade price and tagging the manufacturer.
  if (body.quoteRequestId) {
    const { data: qItems } = await supabaseAdmin
      .from('quote_request_items')
      .select('product_id, product_name, quantity, selected_finish, selected_fabric, selected_size, notes, product:products(name, trade_price, artisan_id)')
      .eq('quote_request_id', body.quoteRequestId)

    if (qItems && qItems.length > 0) {
      const rows = qItems.map((it: Record<string, unknown>, i: number) => {
        const prod = it.product as Record<string, unknown> | null
        return {
          proforma_id:     proforma.id,
          product_id:      it.product_id ?? null,
          is_bespoke:      false,
          name:            (prod?.name as string) ?? (it.product_name as string) ?? 'Item',
          manufacturer_id: (prod?.artisan_id as string) ?? null,
          quantity:        (it.quantity as number) ?? 1,
          unit_price:      (prod?.trade_price as number) ?? null,
          currency:        body.currency || 'GBP',
          selected_finish: it.selected_finish ?? null,
          selected_fabric: it.selected_fabric ?? null,
          selected_size:   it.selected_size ?? null,
          notes:           it.notes ?? null,
          sort_order:      i,
        }
      })
      await supabaseAdmin.from('proforma_line_items').insert(rows)
    }
  }

  await logAudit({ actor: session, action: 'proforma.created', entityType: 'proforma', entityId: proforma.id, after: { number: proforma.proforma_number, fromQuoteRequest: body.quoteRequestId ?? null } })

  return NextResponse.json({ success: true, data: proforma })
}
