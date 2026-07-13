import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { createCreditNoteFromException } from '@/lib/commercial/creditNotes'
import { UUID_RE, vUuid, vNumber, vString, vEnum, ValidationError } from '@/lib/commercial/validation'
import { TAX_CATEGORIES, type TaxCategory } from '@/lib/commercial/types'

export const runtime = 'nodejs'

// POST — pre-fill a draft credit note from a "credited" delivery
// exception, linked to a chosen invoice. body: { invoiceId, reason?, lines?[], amount? }
export async function POST(req: NextRequest, ctx: { params: Promise<{ exceptionId: string }> }) {
  const { exceptionId } = await ctx.params
  const cs = await requireCommercial('credit_note_create')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(exceptionId)) return NextResponse.json({ error: 'Invalid exception id' }, { status: 400 })
  try {
    const body = await req.json().catch(() => ({}))
    const invoiceId = vUuid(body.invoiceId, 'invoiceId')
    const reason = vString(body.reason, 'reason', { max: 2000 })
    let lines: Array<{ name: string; quantity: number; unitPrice: number; taxCategory: TaxCategory; taxRate: number | null }> | undefined
    if (Array.isArray(body.lines) && body.lines.length) {
      lines = body.lines.slice(0, 100).map((l: Record<string, unknown>) => ({
        name: vString(l.name, 'line.name', { required: true, max: 300 })!,
        quantity: vNumber(l.quantity, 'line.quantity', { required: true, min: 0.0001 })!,
        unitPrice: vNumber(l.unitPrice, 'line.unitPrice', { required: true, min: 0 })!,
        taxCategory: (vEnum(l.taxCategory, 'line.taxCategory', TAX_CATEGORIES) ?? 'standard') as TaxCategory,
        taxRate: l.taxRate == null ? null : vNumber(l.taxRate, 'line.taxRate', { min: 0, max: 100 }),
      }))
    }
    const amount = lines ? null : vNumber(body.amount, 'amount', { min: 0.01 })
    const res = await createCreditNoteFromException({ exceptionId, invoiceId, reason: reason ?? undefined, lines, amount, actor: cs.user })
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ creditNote: res.data.creditNote }, { status: 201 })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
