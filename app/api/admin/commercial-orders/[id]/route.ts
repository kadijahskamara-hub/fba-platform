import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { procurementState } from '@/lib/commercial/purchaseOrders'
import { lineEligibleForProcurement, assessAllocationReadiness } from '@/lib/commercial/poCalculations'
import { logAudit } from '@/lib/audit'
import { ValidationError, vUuid, vString, vEnum } from '@/lib/commercial/validation'

// GET /api/admin/commercial-orders/:id — procurement state: order,
// source lines with eligibility/readiness, allocations, POs.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('quote_pipeline_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try { vUuid(params.id, 'id') } catch {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
  }

  const state = await procurementState(params.id)
  if (!state) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  // Per-line procurement view: eligibility + readiness problems.
  const allocBySource = new Map<string, Record<string, unknown>[]>()
  for (const a of state.allocations) {
    const key = a.source_line_item_id as string
    if (!allocBySource.has(key)) allocBySource.set(key, [])
    allocBySource.get(key)!.push(a)
  }

  const lines = state.lines.map((l: Record<string, unknown>) => {
    const eligible = lineEligibleForProcurement(l.line_type as string)
    const allocations = allocBySource.get(l.id as string) ?? []
    const activeAllocs = allocations.filter(a => !['cancelled', 'superseded'].includes(a.allocation_status as string))
    const readiness = eligible ? assessAllocationReadiness({
      manufacturerId: (l.manufacturer_id as string) ?? null,
      supplierCostUnit: l.supplier_cost_source === 'unavailable' ? null : (l.supplier_cost_unit == null ? null : Number(l.supplier_cost_unit)),
      supplierCurrency: ((l.product as Record<string, unknown> | null)?.supplier_currency as string)
        ?? ((l.manufacturer as Record<string, unknown> | null)?.default_currency as string) ?? 'GBP',
      quantity: Number(l.quantity),
      sourceQuantity: Number(l.quantity),
    }) : { ready: false, problems: ['Line type is not procured from manufacturers.'] }
    return { line: l, eligible, readiness, allocations: activeAllocs }
  })

  const perms = {
    canPrepare: cs.permissions.has('purchase_order_prepare'),
    canApprove: cs.permissions.has('purchase_order_approve') || cs.isUltraAdmin,
    isUltraAdmin: cs.isUltraAdmin,
  }
  return NextResponse.json({ success: true, data: { ...state, lines }, permissions: perms })
}

// PATCH /api/admin/commercial-orders/:id — status transitions / cancel.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')
    const body = await req.json()
    const { data: order } = await supabaseAdmin
      .from('commercial_orders').select('id, status, order_number').eq('id', params.id).single()
    if (!order) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.status !== undefined) {
      const status = vEnum(body.status, 'status', ['draft', 'pending_acceptance', 'accepted', 'procurement_ready', 'partially_ordered', 'fully_ordered', 'in_progress', 'partially_delivered', 'completed', 'cancelled'] as const, { required: true })
      if (status === 'cancelled') {
        const reason = vString(body.cancelReason, 'cancelReason', { required: true, max: 500 })
        // Block cancellation while issued POs are live.
        const { data: livePos } = await supabaseAdmin
          .from('purchase_orders').select('id')
          .eq('commercial_order_id', params.id)
          .not('status', 'in', '(draft,cancelled)')
        if (livePos && livePos.length > 0) {
          return NextResponse.json({ success: false, error: 'Cancel or resolve the live purchase orders on this order first.' }, { status: 409 })
        }
        updates.cancelled_at = new Date().toISOString()
        updates.cancel_reason = reason
        await logAudit({ actor: cs.user, action: 'commercial.sales_order_cancelled', entityType: 'commercial_order', entityId: params.id, after: { reason } })
      }
      updates.status = status
    }

    const { data, error } = await supabaseAdmin
      .from('commercial_orders').update(updates).eq('id', params.id).select().single()
    if (error) return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 })
  }
}
