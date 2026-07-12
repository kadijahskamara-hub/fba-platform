import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { approveCreditNote, issueCreditNote, allocateCreditNote } from '@/lib/commercial/creditNotes'
import { ValidationError, vUuid, vNumber } from '@/lib/commercial/validation'

// GET  /api/admin/credit-notes/:id — detail
// POST /api/admin/credit-notes/:id { action:'approve'|'issue'|'allocate', invoiceId?, amount? }
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('invoice_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  const { data: creditNote } = await supabaseAdmin.from('credit_notes').select('*').eq('id', params.id).single()
  if (!creditNote) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  const { data: lines } = await supabaseAdmin.from('credit_note_lines').select('*').eq('credit_note_id', params.id).order('sort_order')
  const { data: allocations } = await supabaseAdmin.from('credit_note_allocations').select('*').eq('credit_note_id', params.id)
  return NextResponse.json({ success: true, data: { creditNote, lines: lines ?? [], allocations: allocations ?? [] } })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  try {
    vUuid(params.id, 'id')
    const body = await req.json().catch(() => ({}))
    const action = body.action

    if (action === 'approve') {
      const cs = await requireCommercial('credit_note_approve')
      if (!cs) return NextResponse.json({ success: false, error: 'Approval requires the credit_note_approve permission.' }, { status: 403 })
      const r = await approveCreditNote(params.id, cs.user)
      if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: r.status })
      return NextResponse.json({ success: true })
    }
    if (action === 'issue') {
      const cs = await requireCommercial('credit_note_approve')
      if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      const r = await issueCreditNote(params.id, cs.user)
      if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: r.status })
      return NextResponse.json({ success: true, data: r.data })
    }
    if (action === 'allocate') {
      const cs = await requireCommercial('credit_note_approve')
      if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      const invoiceId = vUuid(body.invoiceId, 'invoiceId')
      const amount = vNumber(body.amount, 'amount', { required: true, min: 0.01 })!
      const r = await allocateCreditNote({ creditNoteId: params.id, invoiceId, amount, actor: cs.user })
      if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: r.status })
      return NextResponse.json({ success: true, data: r.data })
    }
    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
