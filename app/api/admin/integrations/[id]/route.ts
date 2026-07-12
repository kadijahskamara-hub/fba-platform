import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data, error } = await supabaseAdmin
    .from('brand_integrations').select('*').eq('id', params.id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

const INTEGRATION_FIELDS = [
  'brand_name', 'source_type', 'api_endpoint', 'api_key', 'api_secret',
  'field_mappings', 'is_active', 'notes',
] as const

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const body = await req.json() as Record<string, unknown>
  // Allowlist fields to prevent mass assignment
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of INTEGRATION_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field]
  }
  const { data, error } = await supabaseAdmin
    .from('brand_integrations')
    .update(updates)
    .eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { error } = await supabaseAdmin
    .from('brand_integrations').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
