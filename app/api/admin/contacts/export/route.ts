import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { buildAccountInfoMap } from '@/lib/contactAccounts'
import { accountRoleLabel } from '@/lib/contactRoleLabel'
import { contactSourceLabel } from '@/lib/contactSources'

// ============================================================
// Contacts CSV export (Phase 4.2).
// Streams the full filtered contact list as a CSV download,
// honouring the same search/type/source filters as the list view.
// ============================================================

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s: string
  if (typeof value === 'boolean') s = value ? 'Yes' : 'No'
  else s = String(value)
  // Escape by wrapping in quotes and doubling any embedded quotes.
  // Guard against CSV injection by prefixing risky leading characters.
  if (/^[=+\-@]/.test(s)) s = "'" + s
  return `"${s.replace(/"/g, '""')}"`
}

export async function GET(req: NextRequest) {
  if (!(await isStaff())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const type   = searchParams.get('type') ?? ''
  const source = searchParams.get('source') ?? ''

  let query = supabaseAdmin
    .from('contacts')
    .select('first_name, last_name, email, phone, company_name, contact_type, source, consent_marketing, notes, created_at')
    .order('created_at', { ascending: false })

  if (type)   query = query.eq('contact_type', type)
  if (source) query = query.eq('source', source)
  if (search) {
    query = query.or(
      `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,company_name.ilike.%${search}%`
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const accountMap = await buildAccountInfoMap()

  const headers = [
    'First name', 'Last name', 'Email', 'Phone', 'Company',
    'Type', 'Account status', 'Source', 'Marketing opt-in', 'Message / Notes', 'Date added',
  ]

  const rows = (data ?? []).map((c: Record<string, unknown>) => [
    csvCell(c.first_name),
    csvCell(c.last_name),
    csvCell(c.email),
    csvCell(c.phone),
    csvCell(c.company_name),
    csvCell(c.contact_type),
    csvCell((() => { const i = accountMap.get(String(c.email ?? '').toLowerCase()); return accountRoleLabel(i?.role ?? null, i?.isOwner ?? false) ?? '' })()),
    csvCell(contactSourceLabel(c.source as string | null)),
    csvCell(c.consent_marketing),
    csvCell(c.notes),
    csvCell(c.created_at ? new Date(c.created_at as string).toISOString().slice(0, 10) : ''),
  ].join(','))

  // Prepend a UTF-8 BOM so Excel opens accented characters correctly.
  const csv = '﻿' + [headers.map(csvCell).join(','), ...rows].join('\r\n')

  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="fba-contacts-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
