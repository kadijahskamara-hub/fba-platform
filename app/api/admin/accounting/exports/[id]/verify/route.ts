import { NextRequest, NextResponse } from 'next/server'
import { requireAnyCommercial } from '@/lib/commercial/permissions'
import { verifyExportRun } from '@/lib/commercial/accounting/exportRuns'
import { UUID_RE } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// GET — re-hash each stored CSV against the recorded checksum.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cs = await requireAnyCommercial(['accounting_view', 'accounting_export'])
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const res = await verifyExportRun(id)
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.json(res.data)
}
