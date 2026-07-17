import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { ValidationError, vUuid, vString, vNumber, vBoolean } from '@/lib/commercial/validation'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.id, 'id')
    const body = await req.json().catch(() => ({}))
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const map: Array<[string, () => unknown]> = [
      ['materialTypeId', () => { update.material_type_id = vUuid(body.materialTypeId, 'materialTypeId') }],
      ['name', () => { update.name = vString(body.name, 'name', { required: true, max: 200 }) }],
      ['code', () => { update.code = vString(body.code, 'code', { max: 80 }) }],
      ['hexColour', () => { update.hex_colour = vString(body.hexColour, 'hexColour', { max: 9 }) }],
      ['origin', () => { update.origin = vString(body.origin, 'origin', { max: 200 }) }],
      ['supplier', () => { update.supplier = vString(body.supplier, 'supplier', { max: 200 }) }],
      ['supplierReference', () => { update.supplier_reference = vString(body.supplierReference, 'supplierReference', { max: 200 }) }],
      ['description', () => { update.description = vString(body.description, 'description', { max: 2000 }) }],
      ['technicalNotes', () => { update.technical_notes = vString(body.technicalNotes, 'technicalNotes', { max: 2000 }) }],
      ['sampleAvailable', () => { update.sample_available = vBoolean(body.sampleAvailable, 'sampleAvailable', false) }],
      ['sortOrder', () => { update.sort_order = vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 }) }],
      ['isActive', () => { update.is_active = vBoolean(body.isActive, 'isActive', true) }],
    ]
    for (const [key, apply] of map) if (body[key] !== undefined) apply()
    const { data, error } = await supabaseAdmin.from('finishes')
      .update(update).eq('id', params.id).select().single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}

// DELETE = archive (finishes referenced by options are restrict-FK'd, so
// a hard delete would fail anyway once in use).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }
  const { error } = await supabaseAdmin.from('finishes')
    .update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
