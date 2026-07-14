import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial, requireAnyCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { runExport, DOC_TYPES, type DocType, type ExportScope } from '@/lib/commercial/accounting/exportRuns'
import { vEnum, vDate, vUuidOrNull, ValidationError } from '@/lib/commercial/validation'
import type { AdapterName } from '@/lib/commercial/accountingLogic'

export const runtime = 'nodejs'
const ADAPTERS = ['xero', 'quickbooks', 'sage', 'generic'] as const

// GET — list export runs.
export async function GET() {
  const cs = await requireAnyCommercial(['accounting_view', 'accounting_export'])
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data } = await supabaseAdmin.from('export_runs')
    .select('id, run_number, adapter, scope, row_counts, totals, created_at').order('created_at', { ascending: false }).limit(100)
  return NextResponse.json({ runs: data ?? [] })
}

// POST — run an export (accounting_export). body: { adapter, from, to, periodId?, docTypes? }
export async function POST(req: NextRequest) {
  const cs = await requireCommercial('accounting_export')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const adapter = vEnum(body.adapter, 'adapter', ADAPTERS, { required: true }) as AdapterName
    const periodId = vUuidOrNull(body.periodId, 'periodId')
    const from = periodId ? '' : vDate(body.from, 'from', true)!
    const to = periodId ? '' : vDate(body.to, 'to', true)!
    let docTypes: DocType[] | undefined
    if (Array.isArray(body.docTypes) && body.docTypes.length) {
      docTypes = body.docTypes.map((d: unknown) => vEnum(d, 'docTypes', DOC_TYPES, { required: true }) as DocType)
    }
    const scope: ExportScope = { from, to, periodId, docTypes }
    const res = await runExport({ adapter, scope, actor: cs.user })
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ run: res.data.run }, { status: 201 })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
