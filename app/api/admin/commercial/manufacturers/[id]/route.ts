import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { logAudit } from '@/lib/audit'
import { ValidationError, vUuid, vString, vNumber, vBoolean } from '@/lib/commercial/validation'

// Supplier (procurement) profile for a manufacturer. Separate from the
// public artisan CMS editor: this endpoint touches ONLY supplier/ordering
// fields, and requires purchase-order preparation rights.

const SUPPLIER_FIELDS: Record<string, 'text' | 'number' | 'boolean'> = {
  legal_name: 'text', trading_name: 'text', primary_contact_name: 'text',
  order_email: 'text', finance_email: 'text', telephone: 'text',
  address: 'text', country: 'text', default_currency: 'text',
  default_payment_terms: 'text', default_lead_time: 'text',
  minimum_order_value: 'number', incoterms: 'text',
  vat_or_tax_number: 'text', company_registration_number: 'text',
  ordering_notes: 'text', delivery_notes: 'text', is_active: 'boolean',
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('artisans')
    .select('id, name, is_active, legal_name, trading_name, primary_contact_name, order_email, finance_email, telephone, address, country, default_currency, default_payment_terms, default_lead_time, minimum_order_value, incoterms, vat_or_tax_number, company_registration_number, ordering_notes, delivery_notes')
    .eq('id', params.id).single()
  if (error) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true, data })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')
    const body = await req.json()
    const updates: Record<string, unknown> = {}
    for (const [field, kind] of Object.entries(SUPPLIER_FIELDS)) {
      if (!(field in body)) continue
      if (kind === 'text') updates[field] = vString(body[field], field, { max: 2000 })
      else if (kind === 'number') updates[field] = body[field] === null ? null : vNumber(body[field], field, { min: 0 })
      else updates[field] = vBoolean(body[field], field, true)
    }
    if (updates.default_currency === null) updates.default_currency = 'GBP'
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No supplier fields to update' }, { status: 400 })
    }
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('artisans').update(updates).eq('id', params.id).select('id, name').single()
    if (error) return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })

    await logAudit({
      actor: cs.user, action: 'commercial.allocation_updated', entityType: 'artisan_supplier_profile', entityId: params.id,
      after: { fields: Object.keys(updates).filter(k => k !== 'updated_at') },
    })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 })
  }
}
