import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session || !isStaffRole(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data, error } = await supabaseAdmin
    .from('brand_integrations').select('*').order('brand_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

const INTEGRATION_FIELDS = [
  'brand_name', 'source_type', 'api_endpoint', 'api_key', 'api_secret',
  'field_mappings', 'is_active', 'notes',
] as const

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !isStaffRole(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const body = await req.json() as Record<string, unknown>
  // Allowlist fields to prevent mass assignment
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of INTEGRATION_FIELDS) {
    if (body[field] !== undefined) payload[field] = body[field]
  }
  const { data, error } = await supabaseAdmin
    .from('brand_integrations')
    .insert(payload)
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
