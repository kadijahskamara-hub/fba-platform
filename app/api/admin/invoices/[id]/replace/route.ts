import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { replaceInvoice } from '@/lib/commercial/invoiceControls'
import { UUID_RE } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// POST — clone a (voided) invoice into a fresh draft, cross-referenced.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cs = await requireCommercial('invoice_create')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const res = await replaceInvoice(id, cs.user)
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.json({ invoiceId: res.data.invoiceId }, { status: 201 })
}
