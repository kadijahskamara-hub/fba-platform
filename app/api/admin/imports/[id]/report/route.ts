import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// ============================================================
// CSV report for an import batch (admin brief §4.7)
// Columns: row_number, source_product_id, reference_code, sku,
//          product_name, matched_product_id, action, status,
//          message, warning, error
// ============================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ success: false, error: 'Invalid batch id' }, { status: 400 })
  }

  const { data: batch } = await supabaseAdmin
    .from('import_batches')
    .select('batch_ref')
    .eq('id', params.id)
    .single()

  if (!batch) {
    return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 })
  }

  const rows: string[] = ['row_number,source_product_id,reference_code,sku,product_name,matched_product_id,action,status,message,warning,error']

  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: items } = await supabaseAdmin
      .from('import_batch_items')
      .select('source_row_number, source_row_id, reference_code, sku, product_name, product_id, action, status, message, warning, error')
      .eq('batch_id', params.id)
      .order('source_row_number', { ascending: true })
      .range(from, from + PAGE - 1)

    for (const it of items ?? []) {
      rows.push([
        it.source_row_number, it.source_row_id, it.reference_code, it.sku,
        it.product_name, it.product_id, it.action, it.status,
        it.message, it.warning, it.error,
      ].map(csvEscape).join(','))
    }
    if (!items || items.length < PAGE) break
  }

  return new NextResponse(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${batch.batch_ref}-report.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
