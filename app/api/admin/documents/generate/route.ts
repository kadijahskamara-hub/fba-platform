import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { generateDocumentFile } from '@/lib/commercial/documentFiles'
import { vEnum, vUuid, vBoolean, ValidationError } from '@/lib/commercial/validation'
import { DOCUMENT_FILE_ENTITY_TYPES, DOCUMENT_AUDIENCES, type DocumentFileEntityType, type DocumentAudience } from '@/lib/commercial/types'

export const runtime = 'nodejs'

// POST /api/admin/documents/generate
// body: { entityType, entityId, audience?, regenerate? }
// Idempotent per (entity, audience): returns the current file unless
// regenerate=true, which creates version+1 and supersedes the old row.
export async function POST(req: NextRequest) {
  const cs = await requireCommercial('document_generate')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const entityType = vEnum(body.entityType, 'entityType', DOCUMENT_FILE_ENTITY_TYPES, { required: true }) as DocumentFileEntityType
    const entityId = vUuid(body.entityId, 'entityId')
    const audience = body.audience ? (vEnum(body.audience, 'audience', DOCUMENT_AUDIENCES) as DocumentAudience) : null
    const regenerate = vBoolean(body.regenerate, 'regenerate', false) ?? false

    const res = await generateDocumentFile({ entityType, entityId, audience, actor: cs.user, regenerate })
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ file: res.file, created: res.created }, { status: res.created ? 201 : 200 })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
