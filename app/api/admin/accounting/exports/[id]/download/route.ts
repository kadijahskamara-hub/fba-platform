import { NextRequest, NextResponse } from 'next/server'
import { requireAnyCommercial } from '@/lib/commercial/permissions'
import { signedExportFile } from '@/lib/commercial/accounting/exportRuns'
import { UUID_RE } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// GET /api/admin/accounting/exports/:id/download?file=invoices|credit_notes|payments|refunds
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cs = await requireAnyCommercial(['accounting_view', 'accounting_export'])
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const file = (req.nextUrl.searchParams.get('file') ?? '').replace(/[^a-z_]/g, '')
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  const res = await signedExportFile(id, file, cs.user)
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.redirect(res.data.url)
}
