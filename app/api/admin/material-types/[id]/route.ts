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
    if (body.name !== undefined) update.name = vString(body.name, 'name', { required: true, max: 120 })
    if (body.description !== undefined) update.description = vString(body.description, 'description', { max: 1000 })
    if (body.sortOrder !== undefined) update.sort_order = vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 })
    if (body.isActive !== undefined) update.is_active = vBoolean(body.isActive, 'isActive', true)
    const { data, error } = await supabaseAdmin.from('material_types')
      .update(update).eq('id', params.id).select().single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
