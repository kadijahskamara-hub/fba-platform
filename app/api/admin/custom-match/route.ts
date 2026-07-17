import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'
import { CUSTOM_MATCH_STATUSES, type CustomMatchStatus } from '@/lib/customMatch/logic'

// GET /api/admin/custom-match?status= — queue with counts.
export async function GET(req: NextRequest) {
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  const status = req.nextUrl.searchParams.get('status')

  let q = supabaseAdmin.from('custom_match_requests')
    .select(`id, reference_number, status, quantity, requester_name, requester_studio, requester_email,
      supplier_brand, material_code, gloss_level, created_at, submitted_at, assigned_to,
      product:products(id, name, sku, slug),
      material_type:material_types(id, name, slug),
      assignee:users!custom_match_requests_assigned_to_fkey(id, first_name, last_name)`)
    .order('created_at', { ascending: false }).limit(500)
  if (status && status !== 'all' && (CUSTOM_MATCH_STATUSES as readonly string[]).includes(status)) {
    q = q.eq('status', status as CustomMatchStatus)
  }
  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: 'Query failed' }, { status: 500 })

  // status counts for the tab bar
  const { data: allRows } = await supabaseAdmin.from('custom_match_requests').select('status')
  const counts: Record<string, number> = {}
  for (const r of allRows ?? []) counts[r.status as string] = (counts[r.status as string] ?? 0) + 1

  return NextResponse.json({ success: true, data: data ?? [], counts })
}
