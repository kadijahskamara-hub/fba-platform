import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { buildDownloadBundle } from '@/lib/commercial/communicationPacks'
import { UUID_RE } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// POST /api/admin/communications/:id/download?format=eml|txt
// Streams the pack as a downloadable file (an .eml with the PDF(s)
// attached — opens as an editable draft in Outlook — or a plain .txt
// message). Transitions the pack to 'downloaded' and logs the event.
// The platform never sends: staff send it from their own mailbox.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cs = await requireCommercial('communication_prepare')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const format = req.nextUrl.searchParams.get('format') === 'txt' ? 'txt' : 'eml'
  const res = await buildDownloadBundle(id, cs.user, format)
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })

  return new NextResponse(new Uint8Array(res.data.content), {
    status: 200,
    headers: {
      'Content-Type': res.data.contentType,
      'Content-Disposition': `attachment; filename="${res.data.filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
