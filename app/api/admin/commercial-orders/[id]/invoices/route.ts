import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { createDraftInvoice, orderInvoiceState } from '@/lib/commercial/invoices'
import { ValidationError, vUuid, vEnum, vNumber } from '@/lib/commercial/validation'

const TYPES = ['deposit', 'stage', 'final', 'service', 'adjustment'] as const

// GET  /api/admin/commercial-orders/:id/invoices — invoiceable position + invoices
// POST /api/admin/commercial-orders/:id/invoices — create a draft invoice
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('invoice_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch { return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 }) }
  const state = await orderInvoiceState(params.id)
  if (!state) return NextResponse.json({ success: false, error: 'Commercial order not found' }, { status: 404 })
  return NextResponse.json({ success: true, data: state })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('invoice_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.id, 'id')
    const body = await req.json().catch(() => ({}))
    const invoiceType = vEnum(body.invoiceType, 'invoiceType', TYPES, { required: true })!
    const depositOverride = vNumber(body.depositOverride, 'depositOverride', { min: 0 })
    const stageAmount = vNumber(body.stageAmount, 'stageAmount', { min: 0 })
    const selectedLineIds = Array.isArray(body.selectedLineIds)
      ? body.selectedLineIds.filter((x: unknown) => typeof x === 'string') : null
    const result = await createDraftInvoice({
      commercialOrderId: params.id, invoiceType, actor: cs.user,
      depositOverride, selectedLineIds, stageAmount,
    })
    if ('error' in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, data: result.data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Request failed.' }, { status: 500 })
  }
}
