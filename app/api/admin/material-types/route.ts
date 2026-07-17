import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { ValidationError, vString, vNumber, vBoolean } from '@/lib/commercial/validation'

// Material types drive the public FINISH TYPE filter and the Custom
// Match material selector (Sprint 11).

export async function GET() {
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  const { data, error } = await supabaseAdmin
    .from('material_types').select('*').order('sort_order').order('name')
  if (error) return NextResponse.json({ success: false, error: 'Query failed' }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const name = vString(body.name, 'name', { required: true, max: 120 })!
    const slug = (vString(body.slug, 'slug', { max: 120 }) ?? name)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const { data, error } = await supabaseAdmin.from('material_types').insert({
      name,
      slug,
      description: vString(body.description, 'description', { max: 1000 }),
      sort_order: vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 }) ?? 0,
      is_active: vBoolean(body.isActive, 'isActive', true),
    }).select().single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
