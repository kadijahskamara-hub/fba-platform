import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAnyCommercial, hasPermission } from '@/lib/commercial/permissions'
import { computeLeadTimeStats, type LeadTimeEntry } from '@/lib/commercial/operationsLogic'
import { vUuidOrNull, ValidationError } from '@/lib/commercial/validation'

// ============================================================
// GET /api/admin/operations/supplier-progress[?manufacturerId=]
// Per-maker open-PO progress + rolling lead-time stats.
// Lead-time averages are computed from history and shown only
// with ≥3 complete data points — never fabricated.
// PO values require quote_price_edit (masked otherwise).
// ============================================================

export const dynamic = 'force-dynamic'

const OPEN_PO_STATUSES = [
  'issued', 'viewed', 'acknowledged', 'supplier_amendment_requested',
  'revised', 'confirmed', 'in_production', 'ready_for_dispatch',
  'dispatched', 'partially_received',
]

export async function GET(req: NextRequest) {
  const cs = await requireAnyCommercial(['delivery_view', 'quote_pipeline_view'])
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  const canSeeMoney = hasPermission(cs, 'quote_price_edit')

  let manufacturerId: string | null
  try {
    manufacturerId = vUuidOrNull(req.nextUrl.searchParams.get('manufacturerId'), 'manufacturerId')
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    }
    throw e
  }

  let query = supabaseAdmin.from('vw_supplier_progress').select('*').order('issued_at', { ascending: false }).limit(1000)
  if (manufacturerId) query = query.eq('manufacturer_id', manufacturerId)
  const { data: rows } = await query
  const all = (rows ?? []) as Record<string, unknown>[]

  // Group by maker: open POs + lead-time history per maker.
  const makers = new Map<string, {
    manufacturerId: string | null
    manufacturerName: string | null
    openPos: Record<string, unknown>[]
    leadTimeEntries: LeadTimeEntry[]
  }>()
  for (const po of all) {
    const key = (po.manufacturer_id as string | null) ?? 'unassigned'
    if (!makers.has(key)) {
      makers.set(key, {
        manufacturerId: po.manufacturer_id as string | null,
        manufacturerName: (po.manufacturer_name as string | null) ?? 'Unassigned',
        openPos: [],
        leadTimeEntries: [],
      })
    }
    const m = makers.get(key)!
    const status = po.status as string
    if (OPEN_PO_STATUSES.includes(status)) {
      m.openPos.push(canSeeMoney ? po : { ...po, grand_total: null })
    }
    // History pair: promised completion vs actual dispatch.
    m.leadTimeEntries.push({
      expected: (po.expected_completion_date as string | null) ?? null,
      actual: (po.dispatched_at as string | null) ?? null,
    })
  }

  const data = Array.from(makers.values()).map(m => ({
    manufacturerId: m.manufacturerId,
    manufacturerName: m.manufacturerName,
    openPos: m.openPos,
    leadTime: computeLeadTimeStats(m.leadTimeEntries), // null when <3 points
  })).sort((a, b) => (a.manufacturerName ?? '').localeCompare(b.manufacturerName ?? ''))

  return NextResponse.json({ success: true, data: { makers: data, canSeeMoney } })
}
