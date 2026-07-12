import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { approveDocument, rejectApproval } from '@/lib/commercial/approvals'
import { recalculateAndPersist } from '@/lib/commercial/recalc'
import { vUuid, vString, ValidationError } from '@/lib/commercial/validation'

// POST /api/admin/proformas/:id/approve
//   { action: 'approve' | 'reject', note?: string }
// Approver rules are enforced in lib/commercial/approvals:
//   required_commercial → quote_approve; required_ultra/blocked → Ultra Admin.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('quote_pipeline_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  let action: string, note: string | null
  try {
    vUuid(params.id, 'id')
    const body = await req.json()
    action = body.action === 'reject' ? 'reject' : 'approve'
    note = vString(body.note, 'note', { max: 1000 })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof ValidationError ? e.message : 'Invalid request' }, { status: 400 })
  }

  // Recalculate first so the decision is made against current figures,
  // never against a stale approval banner.
  const recalc = await recalculateAndPersist(params.id)
  if ('error' in recalc) return NextResponse.json({ success: false, error: recalc.error }, { status: recalc.status })

  const result = action === 'approve'
    ? await approveDocument({ proformaId: params.id, cs, note })
    : await rejectApproval({ proformaId: params.id, cs, note })

  if ('error' in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  return NextResponse.json({ success: true })
}
