import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'
import { ValidationError, vUuid, vString, vNumber, vBoolean } from '@/lib/commercial/validation'

// Technical passport attributes: claims display publicly ONLY when
// active + public + verified + unexpired (md doc §8).

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }
  const { data, error } = await supabaseAdmin.from('product_passport_attributes')
    .select('*, verifier:users!product_passport_attributes_verified_by_fkey(first_name, last_name)')
    .eq('product_id', params.id).eq('is_active', true).order('sort_order')
  if (error) return NextResponse.json({ success: false, error: 'Query failed' }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.id, 'id')
    const body = await req.json().catch(() => ({}))
    const label = vString(body.label, 'label', { required: true, max: 200 })!
    const key = (vString(body.attributeKey, 'attributeKey', { max: 80 }) ?? label)
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    const isVerified = vBoolean(body.isVerified, 'isVerified', false)
    const { data, error } = await supabaseAdmin.from('product_passport_attributes').insert({
      product_id: params.id,
      attribute_key: key,
      label,
      value_text: vString(body.valueText, 'valueText', { max: 500 }),
      is_public: vBoolean(body.isPublic, 'isPublic', false),
      is_verified: isVerified,
      verified_by: isVerified ? session.id : null,
      verified_at: isVerified ? new Date().toISOString() : null,
      expires_at: vString(body.expiresAt, 'expiresAt', { max: 30 }) || null,
      sort_order: vNumber(body.sortOrder, 'sortOrder', { min: 0, max: 100000 }) ?? 0,
    }).select().single()
    if (error) {
      const msg = error.code === '23505' ? `The attribute "${key}" already exists on this product.` : error.message
      return NextResponse.json({ success: false, error: msg }, { status: 500 })
    }
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
