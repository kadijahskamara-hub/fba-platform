import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { ValidationError, vString, vNumber, vBoolean, vUuid } from '@/lib/commercial/validation'

// Reusable finish library (Sprint 11). Supplier fields are internal —
// they are edited here but must never reach public payloads.

export async function GET(req: NextRequest) {
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  const sp = req.nextUrl.searchParams
  let q = supabaseAdmin.from('finishes')
    .select('*, material_type:material_types(id, name, slug)')
    .order('sort_order').order('name').limit(1000)
  const mt = sp.get('materialType'); if (mt) q = q.eq('material_type_id', mt)
  const active = sp.get('active'); if (active === 'true') q = q.eq('is_active', true)
  const search = sp.get('q'); if (search) q = q.ilike('name', `%${search.replace(/[%_]/g, '')}%`)
  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: 'Query failed' }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const name = vString(body.name, 'name', { required: true, max: 200 })!
    const slugBase = (vString(body.slug, 'slug', { max: 200 }) ?? name)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const row = {
      material_type_id: vUuid(body.materialTypeId, 'materialTypeId'),
      name,
      slug: slugBase,
      code: vString(body.code, 'code', { max: 80 }),
      hex_colour: vString(body.hexColour, 'hexColour', { max: 9 }),
      origin: vString(body.origin, 'origin', { max: 200 }),
      supplier: vString(body.supplier, 'supplier', { max: 200 }),
      supplier_reference: vString(body.supplierReference, 'supplierReference', { max: 200 }),
      description: vString(body.description, 'description', { max: 2000 }),
      technical_notes: vString(body.technicalNotes, 'technicalNotes', { max: 2000 }),
      sample_available: vBoolean(body.sampleAvailable, 'sampleAvailable', false),
      sort_order: vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 }) ?? 0,
    }
    let { data, error } = await supabaseAdmin.from('finishes').insert(row).select().single()
    if (error && error.code === '23505') {
      // slug collision — suffix and retry once
      const retry = await supabaseAdmin.from('finishes')
        .insert({ ...row, slug: `${slugBase}-${Math.random().toString(36).slice(2, 6)}` }).select().single()
      data = retry.data; error = retry.error
    }
    if (error || !data) return NextResponse.json({ success: false, error: error?.message ?? 'Create failed' }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
