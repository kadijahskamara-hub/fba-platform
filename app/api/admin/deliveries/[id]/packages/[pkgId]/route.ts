import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { ValidationError, vUuid, vString } from '@/lib/commercial/validation'

// PATCH  /api/admin/deliveries/:id/packages/:pkgId
// DELETE /api/admin/deliveries/:id/packages/:pkgId
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; pkgId: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id'); vUuid(params.pkgId, 'pkgId')
    const body = await req.json()
    const updates: Record<string, unknown> = {}
    if (body.reference !== undefined) updates.reference = vString(body.reference, 'reference', { max: 200 })
    if (body.description !== undefined) updates.description = vString(body.description, 'description', { max: 500 })
    if (body.weight !== undefined) updates.weight = vString(body.weight, 'weight', { max: 60 })
    if (body.dimensions !== undefined) updates.dimensions = vString(body.dimensions, 'dimensions', { max: 120 })
    if (Object.keys(updates).length === 0) return NextResponse.json({ success: true })

    const { error } = await supabaseAdmin.from('delivery_packages')
      .update(updates).eq('id', params.pkgId).eq('delivery_id', params.id)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; pkgId: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id'); vUuid(params.pkgId, 'pkgId') } catch {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
  }
  const { error } = await supabaseAdmin.from('delivery_packages')
    .delete().eq('id', params.pkgId).eq('delivery_id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
