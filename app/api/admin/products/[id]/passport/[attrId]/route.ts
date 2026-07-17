import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'
import { ValidationError, vUuid, vString, vNumber, vBoolean } from '@/lib/commercial/validation'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; attrId: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.attrId, 'attrId')
    const body = await req.json().catch(() => ({}))
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.label !== undefined) update.label = vString(body.label, 'label', { required: true, max: 200 })
    if (body.valueText !== undefined) update.value_text = vString(body.valueText, 'valueText', { max: 500 })
    if (body.isPublic !== undefined) update.is_public = vBoolean(body.isPublic, 'isPublic', false)
    if (body.expiresAt !== undefined) update.expires_at = vString(body.expiresAt, 'expiresAt', { max: 30 }) || null
    if (body.sortOrder !== undefined) update.sort_order = vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 })
    if (body.isVerified !== undefined) {
      const verified = vBoolean(body.isVerified, 'isVerified', false)
      update.is_verified = verified
      update.verified_by = verified ? session.id : null
      update.verified_at = verified ? new Date().toISOString() : null
    }
    const { data, error } = await supabaseAdmin.from('product_passport_attributes')
      .update(update).eq('id', params.attrId).eq('product_id', params.id).select().single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; attrId: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.attrId, 'attrId') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }
  const { error } = await supabaseAdmin.from('product_passport_attributes')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', params.attrId).eq('product_id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
