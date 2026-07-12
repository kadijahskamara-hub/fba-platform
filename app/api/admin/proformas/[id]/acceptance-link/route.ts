import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { createAcceptanceToken, adminRecordAcceptance } from '@/lib/commercial/acceptance'
import { ValidationError, vUuid, vString } from '@/lib/commercial/validation'

// POST /api/admin/proformas/:id/acceptance-link
//   { mode: 'link' }  → mint a single-purpose client acceptance link (returned once)
//   { mode: 'admin_record', name, email, reason, evidence } → record offline acceptance
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('quote_approve')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof ValidationError ? e.message : 'Invalid id' }, { status: 400 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    if (body.mode === 'admin_record') {
      const result = await adminRecordAcceptance({
        proformaId: params.id,
        name: vString(body.name, 'name', { required: true, max: 200 })!,
        email: vString(body.email, 'email', { required: true, max: 200 })!,
        reason: vString(body.reason, 'reason', { required: true, max: 2000 })!,
        evidence: vString(body.evidence, 'evidence', { required: true, max: 2000 })!,
        actor: cs.user,
      })
      if ('error' in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
      return NextResponse.json({ success: true, data: result.data })
    }
    const result = await createAcceptanceToken({ proformaId: params.id, actor: cs.user })
    if ('error' in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, data: result.data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
