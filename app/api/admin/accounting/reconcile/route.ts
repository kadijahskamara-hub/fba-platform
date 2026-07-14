import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { reconcileDocuments, DOC_TYPES, type DocType } from '@/lib/commercial/accounting/exportRuns'
import { vEnum, vString, UUID_RE, ValidationError } from '@/lib/commercial/validation'

export const runtime = 'nodejs'

// POST — bulk mark reconciled / excluded (reconciliation_manage).
// body: { docType, ids[], action: 'reconciled'|'excluded', note? }
export async function POST(req: NextRequest) {
  const cs = await requireCommercial('reconciliation_manage')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const docType = vEnum(body.docType, 'docType', DOC_TYPES, { required: true }) as DocType
    const action = vEnum(body.action, 'action', ['reconciled', 'excluded'] as const, { required: true })!
    if (!Array.isArray(body.ids) || body.ids.length === 0) throw new ValidationError('ids must be a non-empty array')
    const ids = body.ids.map((x: unknown) => String(x))
    if (ids.some((x: string) => !UUID_RE.test(x))) throw new ValidationError('ids must be UUIDs')
    if (ids.length > 500) throw new ValidationError('Too many ids (max 500)')
    const note = vString(body.note, 'note', { max: 2000 })
    const res = await reconcileDocuments({ docType, ids, action, note, actor: cs.user })
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ ok: true, updated: res.data.updated })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
