import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { nextInvoiceNumber } from '@/lib/commercial/numbering'
import { logAudit } from '@/lib/audit'
import { UUID_RE, DATE_RE } from '@/lib/commercial/validation'

// POST /api/admin/proformas/:id/invoice — assign an invoice identity
// (number + dates) to the working record. The controlled, immutable
// invoice document itself is produced via POST :id/issue { docType:
// 'invoice' | 'service_invoice' }, which freezes a snapshot.
// Idempotent: converting again only updates the dates.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('invoice_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  if (body.invoiceDate && !DATE_RE.test(String(body.invoiceDate))) {
    return NextResponse.json({ success: false, error: 'invoiceDate must be YYYY-MM-DD' }, { status: 400 })
  }
  if (body.invoiceDueDate && !DATE_RE.test(String(body.invoiceDueDate))) {
    return NextResponse.json({ success: false, error: 'invoiceDueDate must be YYYY-MM-DD' }, { status: 400 })
  }

  const { data: pf, error: fErr } = await supabaseAdmin
    .from('proformas').select('id, proforma_number, invoice_number, locked_at').eq('id', params.id).single()
  if (fErr || !pf) return NextResponse.json({ success: false, error: 'Proforma not found' }, { status: 404 })
  if (pf.locked_at && pf.invoice_number) {
    return NextResponse.json({ success: false, error: 'This document is issued and already has an invoice identity.' }, { status: 409 })
  }

  let invoiceNumber = pf.invoice_number as string | null
  if (!invoiceNumber) {
    try { invoiceNumber = await nextInvoiceNumber() } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 })
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const defaultDue = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

  const { data, error } = await supabaseAdmin
    .from('proformas')
    .update({
      invoice_number: invoiceNumber,
      invoice_date: body.invoiceDate || today,
      invoice_due_date: body.invoiceDueDate || defaultDue,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })

  if (!pf.invoice_number) {
    await logAudit({
      actor: cs.user, action: 'commercial.invoice_created', entityType: 'proforma', entityId: params.id,
      after: { invoiceNumber },
    })
  }

  return NextResponse.json({ success: true, data })
}
