import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { buildAccountInfoMap } from '@/lib/contactAccounts'

export async function GET(req: NextRequest) {
  if (!(await isStaff())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit  = Math.min(100, parseInt(searchParams.get('limit') ?? '20'))
  const search = searchParams.get('search') ?? ''
  const type   = searchParams.get('type') ?? ''
  const source = searchParams.get('source') ?? ''
  const offset = (page - 1) * limit

  let query = supabaseAdmin
    .from('contacts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (type)   query = query.eq('contact_type', type)
  if (source) query = query.eq('source', source)
  if (search) {
    query = query.or(
      `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,company_name.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  // Enrich each contact with its matching user account's real role (Phase 4.1).
  const accountMap = await buildAccountInfoMap()
  const enriched = (data ?? []).map((c: Record<string, unknown>) => {
    const info = accountMap.get(String(c.email ?? '').toLowerCase())
    return { ...c, account_role: info?.role ?? null, account_is_owner: info?.isOwner ?? false }
  })

  return NextResponse.json({ success: true, data: enriched, total: count ?? 0 })
}

// POST /api/admin/contacts — create a contact record (Phase 4.3)
export async function POST(req: NextRequest) {
  if (!(await isStaff())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  if (!body.email?.trim()) {
    return NextResponse.json({ success: false, error: 'Email is required.' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .insert({
      first_name:        body.firstName?.trim() || null,
      last_name:         body.lastName?.trim() || null,
      email:             body.email.toLowerCase().trim(),
      phone:             body.phone?.trim() || null,
      company_name:      body.companyName?.trim() || null,
      contact_type:      body.contactType || 'general',
      source:            body.source || 'manual',
      consent_marketing: body.consentMarketing ?? false,
      notes:             body.notes || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
