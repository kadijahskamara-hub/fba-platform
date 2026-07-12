import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { issueInvoice } from '@/lib/commercial/invoices'
import { ValidationError, vUuid } from '@/lib/commercial/validation'

// POST /api/admin/invoices/:id/issue — assign number, freeze snapshot, lock (atomic).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('invoice_issue')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try { vUuid(params.id, 'id') } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof ValidationError ? e.message : 'Invalid id' }, { status: 400 })
  }
  const r = await issueInvoice(params.id, cs.user)
  if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: r.status })
  return NextResponse.json({ success: true, data: r.data })
}
