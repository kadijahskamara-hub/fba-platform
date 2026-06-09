import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'

// GET /api/admin/trade-applications/counts — real DB counts per status
export async function GET() {
  const session = await getSession()
  if (!session || !isStaffRole(session)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const statuses = ['pending', 'form_sent', 'under_review', 'approved', 'declined', 'revoked'] as const
  const results = await Promise.all(
    statuses.map(s =>
      supabaseAdmin
        .from('trade_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', s)
    )
  )

  const counts: Record<string, number> = { all: 0 }
  statuses.forEach((s, i) => {
    const c = results[i].count ?? 0
    counts[s] = c
    counts.all += c
  })

  return NextResponse.json({ success: true, data: counts })
}
