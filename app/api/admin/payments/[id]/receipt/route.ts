import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { renderReceipt } from '@/lib/commercial/invoiceDocuments'

// GET /api/admin/payments/:id/receipt — render the immutable receipt document.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const cs = await requireCommercial('payment_view')
  if (!cs) return new NextResponse('Forbidden', { status: 403 })
  const { data: receipt } = await supabaseAdmin.from('payment_receipts').select('snapshot').eq('payment_id', params.id).maybeSingle()
  if (!receipt) return new NextResponse('No receipt has been issued for this payment.', { status: 404 })
  const html = renderReceipt(receipt.snapshot as Record<string, unknown>)
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
