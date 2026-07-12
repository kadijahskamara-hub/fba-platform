import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'

// GET /api/admin/contacts/:id — contact + notes + linked pipeline entries (4.3)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const { data: contact, error } = await supabaseAdmin
    .from('contacts').select('*').eq('id', params.id).single()
  if (error || !contact) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  const { data: notes } = await supabaseAdmin
    .from('contact_notes')
    .select('id, body, created_at, author:users(first_name, last_name)')
    .eq('contact_id', params.id)
    .order('created_at', { ascending: false })

  // Linked Quote Pipeline entries — matched by email (kept a separate section
  // per 2.8; the contact record is not itself a pipeline entry).
  const email = String(contact.email ?? '').toLowerCase()
  let proformas: unknown[] = []
  if (email) {
    const { data: userRow } = await supabaseAdmin
      .from('users').select('id').ilike('email', email).maybeSingle()
    let orFilter = `client_email.ilike.${email}`
    if (userRow?.id) orFilter += `,contact_user_id.eq.${userRow.id}`
    const { data } = await supabaseAdmin
      .from('proformas')
      .select('id, proforma_number, stage, project_name, currency, updated_at, items:proforma_line_items(unit_price, quantity)')
      .or(orFilter)
      .order('updated_at', { ascending: false })
    proformas = data ?? []
  }

  return NextResponse.json({ success: true, data: { contact, notes: notes ?? [], proformas } })
}

// PATCH /api/admin/contacts/:id — edit contact record
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const map: Record<string, string> = {
    firstName: 'first_name', lastName: 'last_name', email: 'email', phone: 'phone',
    companyName: 'company_name', contactType: 'contact_type', consentMarketing: 'consent_marketing', notes: 'notes',
  }
  const updates: Record<string, unknown> = {}
  for (const [camel, snake] of Object.entries(map)) {
    if (body[camel] !== undefined) {
      updates[snake] = snake === 'email' ? String(body[camel]).toLowerCase().trim()
        : snake === 'consent_marketing' ? !!body[camel]
        : (body[camel] || null)
    }
  }
  if (updates.email === '') return NextResponse.json({ success: false, error: 'Email cannot be empty.' }, { status: 400 })
  if (Object.keys(updates).length === 0) return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('contacts').update(updates).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

// DELETE /api/admin/contacts/:id
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  const { error } = await supabaseAdmin.from('contacts').delete().eq('id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
