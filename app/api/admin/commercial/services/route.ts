import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { logAudit } from '@/lib/audit'
import { ValidationError, vString, vNumber, vEnum, vBoolean } from '@/lib/commercial/validation'
import { TAX_CATEGORIES } from '@/lib/commercial/types'

// GET /api/admin/commercial/services — service catalogue (active by default)
export async function GET(req: NextRequest) {
  const cs = await requireCommercial('quote_pipeline_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const includeInactive = req.nextUrl.searchParams.get('all') === '1'
  let q = supabaseAdmin.from('service_catalogue').select('*').order('name')
  if (!includeInactive) q = q.eq('active', true) as typeof q
  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: 'Could not load services.' }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

// POST /api/admin/commercial/services — add a catalogue service
export async function POST(req: NextRequest) {
  const cs = await requireCommercial('commercial_settings_manage')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const row = {
      code: vString(body.code, 'code', { required: true, max: 40 })!.toUpperCase().replace(/[^A-Z0-9-]/g, ''),
      name: vString(body.name, 'name', { required: true, max: 200 }),
      description: vString(body.description, 'description', { max: 2000 }),
      pricing_type: vEnum(body.pricingType, 'pricingType', ['fixed', 'hourly', 'daily', 'percentage', 'quantity', 'manual'] as const, { required: true }),
      default_rate: vNumber(body.defaultRate, 'defaultRate', { min: 0 }),
      default_unit: vString(body.defaultUnit, 'defaultUnit', { max: 60 }),
      default_tax_category: vEnum(body.defaultTaxCategory, 'defaultTaxCategory', TAX_CATEGORIES) ?? 'standard',
      active: vBoolean(body.active, 'active', true),
    }
    const { data, error } = await supabaseAdmin.from('service_catalogue').insert(row).select().single()
    if (error) return NextResponse.json({ success: false, error: error.code === '23505' ? 'A service with this code already exists.' : 'Insert failed.' }, { status: 400 })
    await logAudit({ actor: cs.user, action: 'commercial.settings_changed', entityType: 'service_catalogue', entityId: data.id, after: { code: row.code } })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 })
  }
}
