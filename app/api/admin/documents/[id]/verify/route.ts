import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { verifyDocumentFile } from '@/lib/commercial/documentFiles'
import { UUID_RE } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// GET /api/admin/documents/:id/verify
// Re-downloads the stored bytes, re-hashes, and reports match/mismatch
// against the recorded sha256 (tamper / corruption check).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cs = await requireCommercial('document_verify')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const res = await verifyDocumentFile(id)
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.json(res)
}
