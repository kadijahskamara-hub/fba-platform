import { NextRequest, NextResponse } from 'next/server'
import { requireAnyCommercial } from '@/lib/commercial/permissions'
import { documentVersionChain, currentDocumentFile } from '@/lib/commercial/documentFiles'
import { vEnum, vUuid, ValidationError } from '@/lib/commercial/validation'
import { DOCUMENT_FILE_ENTITY_TYPES, DOCUMENT_AUDIENCES, type DocumentFileEntityType, type DocumentAudience } from '@/lib/commercial/types'

export const runtime = 'nodejs'

// GET /api/admin/documents?entityType=&entityId=&audience=
// Returns the full version chain + the current (non-superseded) file.
export async function GET(req: NextRequest) {
  const cs = await requireAnyCommercial(['document_generate', 'document_verify'])
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const sp = req.nextUrl.searchParams
    const entityType = vEnum(sp.get('entityType'), 'entityType', DOCUMENT_FILE_ENTITY_TYPES, { required: true }) as DocumentFileEntityType
    const entityId = vUuid(sp.get('entityId'), 'entityId')
    const audParam = sp.get('audience')
    const audience = audParam ? (vEnum(audParam, 'audience', DOCUMENT_AUDIENCES) as DocumentAudience) : undefined

    const chain = await documentVersionChain(entityType, entityId, audience)
    const current = await currentDocumentFile(entityType, entityId, audience ?? null)
    return NextResponse.json({ current, chain })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
