import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

// ============================================================
// Bulk artisan / manufacturer management (final amendments §3)
//
// POST { action, ids } where action ∈
//   publish   — visible on the public site   (is_active=true,  archived_at=null)
//   unpublish — hidden from the public site  (is_active=false)
//   archive   — hidden + archived            (is_active=false, archived_at=now)
//   restore   — back from archive (stays hidden until published)
//   delete    — permanent, admin-only, blocked while any product,
//               quote line, allocation, purchase order or delivery
//               still references the artisan.
//
// Every action is audited. Referenced artisans are skipped on
// delete (never partially deleted) and reported back by name.
// ============================================================

const ACTIONS = ['publish', 'unpublish', 'archive', 'restore', 'delete'] as const
type Action = (typeof ACTIONS)[number]

const MAX_IDS = 200
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Tables that must be empty of references before permanent deletion.
const DEPENDENCIES: Array<{ table: string; column: string; label: string }> = [
  { table: 'products',             column: 'artisan_id',             label: 'products' },
  { table: 'proforma_line_items',  column: 'manufacturer_id',        label: 'quote lines' },
  { table: 'supplier_allocations', column: 'manufacturer_id',        label: 'supplier allocations' },
  { table: 'purchase_orders',      column: 'manufacturer_id',        label: 'purchase orders' },
  { table: 'deliveries',           column: 'origin_manufacturer_id', label: 'deliveries' },
]

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !isStaffRole(session)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { action?: string; ids?: unknown } | null
  const action = body?.action as Action | undefined
  const ids = Array.isArray(body?.ids) ? (body!.ids as unknown[]).filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)) : []

  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ success: false, error: 'Unknown action.' }, { status: 400 })
  }
  if (ids.length === 0) return NextResponse.json({ success: false, error: 'No records selected.' }, { status: 400 })
  if (ids.length > MAX_IDS) return NextResponse.json({ success: false, error: `Select at most ${MAX_IDS} records per action.` }, { status: 400 })

  // Permanent deletion is reserved for full admins.
  if (action === 'delete' && session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Only administrators can permanently delete artisans.' }, { status: 403 })
  }

  const { data: targets } = await supabaseAdmin
    .from('artisans').select('id, name, is_active, archived_at').in('id', ids)
  if (!targets || targets.length === 0) {
    return NextResponse.json({ success: false, error: 'No matching records found.' }, { status: 404 })
  }

  if (action !== 'delete') {
    const patch: Record<string, unknown> =
      action === 'publish'   ? { is_active: true,  archived_at: null } :
      action === 'unpublish' ? { is_active: false } :
      action === 'archive'   ? { is_active: false, archived_at: new Date().toISOString() } :
      /* restore */            { archived_at: null }

    const { error } = await supabaseAdmin.from('artisans').update(patch).in('id', targets.map(t => t.id))
    if (error) return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })

    await logAudit({
      actor: session, action: `artisan.bulk_${action}`, entityType: 'artisan',
      before: { records: targets.map(t => ({ id: t.id, name: t.name, is_active: t.is_active, archived_at: t.archived_at })) },
      after: { patch, count: targets.length },
    })
    return NextResponse.json({ success: true, data: { affected: targets.length } })
  }

  // ── Permanent delete with dependency protection ──
  const blocked = new Map<string, string[]>()  // artisan id → dependency labels
  for (const dep of DEPENDENCIES) {
    const { data, error } = await supabaseAdmin
      .from(dep.table).select(dep.column).in(dep.column, targets.map(t => t.id))
    if (error) {
      return NextResponse.json({ success: false, error: 'Dependency check failed — nothing was deleted.' }, { status: 500 })
    }
    for (const row of (data ?? []) as unknown as Array<Record<string, string>>) {
      const aid = row[dep.column]
      const list = blocked.get(aid) ?? []
      if (!list.includes(dep.label)) list.push(dep.label)
      blocked.set(aid, list)
    }
  }

  const deletable = targets.filter(t => !blocked.has(t.id))
  const skipped   = targets.filter(t => blocked.has(t.id))

  if (deletable.length > 0) {
    const { error } = await supabaseAdmin.from('artisans').delete().in('id', deletable.map(t => t.id))
    if (error) return NextResponse.json({ success: false, error: 'Delete failed — nothing was removed.' }, { status: 500 })

    // Clean up this artisan's media folder (best effort — orphan
    // avoidance; bucket paths are namespaced by artisan id).
    for (const t of deletable) {
      const { data: objs } = await supabaseAdmin.storage.from('artisan-media').list(t.id, { limit: 100 })
      if (objs && objs.length > 0) {
        await supabaseAdmin.storage.from('artisan-media').remove(objs.map(o => `${t.id}/${o.name}`))
      }
    }

    await logAudit({
      actor: session, action: 'artisan.bulk_deleted', entityType: 'artisan',
      before: { records: deletable.map(t => ({ id: t.id, name: t.name })) },
      after: { count: deletable.length },
    })
  }

  const message = skipped.length > 0
    ? `${deletable.length} deleted. ${skipped.length} kept because they are still referenced: ` +
      skipped.map(t => `${t.name} (${blocked.get(t.id)!.join(', ')})`).join('; ') +
      '. Reassign or remove those references first, or archive instead.'
    : `${deletable.length} deleted.`

  return NextResponse.json({ success: true, data: { deleted: deletable.length, skipped: skipped.length }, message })
}
