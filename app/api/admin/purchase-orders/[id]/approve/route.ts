import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { recalcAndPersistPo } from '@/lib/commercial/purchaseOrders'
import { logAudit } from '@/lib/audit'
import { ValidationError, vUuid, vString } from '@/lib/commercial/validation'

// POST /api/admin/purchase-orders/:id/approve
//   { action: 'request' | 'approve' | 'reject', note? }
//
// - request: preparer flags the PO ready for review.
// - approve/reject: requires purchase_order_approve (or Ultra Admin).
//   Segregation of duties: the preparer cannot approve their own PO
//   unless they are Ultra Admin. Blocked POs need Ultra Admin.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('purchase_order_prepare')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  let action: string, note: string | null
  try {
    vUuid(params.id, 'id')
    const body = await req.json()
    action = ['request', 'approve', 'reject'].includes(body.action) ? body.action : 'request'
    note = vString(body.note, 'note', { max: 1000 })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof ValidationError ? e.message : 'Invalid request' }, { status: 400 })
  }

  // Always decide against fresh figures.
  const recalc = await recalcAndPersistPo(params.id)
  if ('error' in recalc) return NextResponse.json({ success: false, error: recalc.error }, { status: recalc.status })
  const po = recalc.po

  if (action === 'request') {
    if (po.approval_status === 'none') {
      return NextResponse.json({ success: false, error: 'No approval is required for this purchase order — it can be issued directly.' }, { status: 400 })
    }
    await supabaseAdmin.from('purchase_orders').update({
      status: 'pending_approval',
      approval_requested_by: cs.user.id,
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)
    await logAudit({ actor: cs.user, action: 'commercial.po_approval_requested', entityType: 'purchase_order', entityId: params.id, after: { note } })
    return NextResponse.json({ success: true })
  }

  // approve / reject — approver rights + segregation of duties.
  const canApprove = cs.permissions.has('purchase_order_approve') || cs.isUltraAdmin
  if (!canApprove) {
    return NextResponse.json({ success: false, error: 'Purchase-order approval rights are required.' }, { status: 403 })
  }
  const isPreparer = po.created_by === cs.user.id || po.approval_requested_by === cs.user.id
  if (isPreparer && !cs.isUltraAdmin) {
    return NextResponse.json({ success: false, error: 'Segregation of duties: you cannot approve a purchase order you prepared.' }, { status: 403 })
  }
  if (po.approval_status === 'blocked' && !cs.isUltraAdmin) {
    return NextResponse.json({ success: false, error: 'This purchase order is blocked — only Ultra Admin can override the blocking condition.' }, { status: 403 })
  }
  if (po.approval_status === 'none') {
    return NextResponse.json({ success: false, error: 'This purchase order does not require approval.' }, { status: 400 })
  }

  if (action === 'approve') {
    await supabaseAdmin.from('purchase_orders').update({
      approval_status: 'approved',
      status: 'approved',
      approved_by: cs.user.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)
    await logAudit({
      actor: cs.user, action: 'commercial.po_approved', entityType: 'purchase_order', entityId: params.id,
      before: { approval_status: po.approval_status, reasons: po.approval_reason }, after: { note },
    })
  } else {
    await supabaseAdmin.from('purchase_orders').update({
      status: 'draft',
      approval_requested_by: null,
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)
    await logAudit({ actor: cs.user, action: 'commercial.po_rejected', entityType: 'purchase_order', entityId: params.id, after: { note } })
  }
  return NextResponse.json({ success: true })
}
