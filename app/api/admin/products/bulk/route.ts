import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

// ============================================================
// Bulk product actions (admin brief §5.7)
// POST { action: 'publish' | 'unpublish' | 'archive' | 'restore', ids: string[] }
// Bulk hard-delete is intentionally NOT supported here — delete
// products one at a time via the lifecycle route's typed confirmation.
// ============================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTIONS = ['publish', 'unpublish', 'archive', 'restore'] as const
type BulkAction = (typeof ACTIONS)[number]

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  let body: { action?: string; ids?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action as BulkAction
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ success: false, error: 'Unknown bulk action' }, { status: 400 })
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === 'string' && UUID_RE.test(i)) : []
  if (ids.length === 0 || ids.length > 100) {
    return NextResponse.json({ success: false, error: 'Provide between 1 and 100 valid product ids.' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now, last_updated_by: session.id }

  switch (action) {
    case 'publish':   updates.visibility = 'published'; break
    case 'unpublish': updates.visibility = 'hidden'; break
    case 'archive':   updates.archived_at = now; updates.archived_by = session.id; break
    case 'restore':   updates.archived_at = null; updates.archived_by = null; break
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .update(updates)
    .in('id', ids)
    .select('id')

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  await logAudit({
    actor: session,
    action: `product.bulk_${action}`,
    entityType: 'product',
    entityId: null,
    after: { count: data?.length ?? 0, ids },
  })

  return NextResponse.json({ success: true, affected: data?.length ?? 0 })
}
