import { NextRequest, NextResponse } from 'next/server'
import { requireAnyCommercial } from '@/lib/commercial/permissions'
import { signedDownloadUrl } from '@/lib/commercial/documentFiles'
import { UUID_RE } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// GET /api/admin/documents/:id/download → 302 to a short-lived signed URL.
// The signed-URL issue is audited (commercial.document_downloaded).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cs = await requireAnyCommercial(['document_generate', 'document_verify'])
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const res = await signedDownloadUrl(id, cs.user)
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.redirect(res.url)
}
