import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

// ============================================================
// Upload a product document to the public `spec-documents`
// bucket and create the product_documents row.
// FormData: file, documentType, label?
// Limits: 15 MB, pdf/doc/docx/xls/xlsx only.
// ============================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 15 * 1024 * 1024

const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

const DOC_TYPES = [
  'product_specification', 'upholstery_program', 'material_finishes',
  'tear_sheet', 'technical_passport', 'care_maintenance', 'installation_guide', 'warranty',
]

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ success: false, error: 'Invalid product id' }, { status: 400 })
  }

  const { data: product } = await supabaseAdmin.from('products').select('id, slug').eq('id', params.id).single()
  if (!product) {
    return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ success: false, error: 'Expected multipart form data' }, { status: 400 })
  }

  const file = form.get('file')
  const documentType = (form.get('documentType') ?? '').toString()
  const label = (form.get('label') ?? '').toString().slice(0, 120) || null

  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
  }
  if (!DOC_TYPES.includes(documentType)) {
    return NextResponse.json({ success: false, error: 'Invalid document type' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ success: false, error: 'File too large (max 15 MB)' }, { status: 400 })
  }
  const ext = ALLOWED_MIME[file.type]
  if (!ext) {
    return NextResponse.json({ success: false, error: 'Only PDF, Word, and Excel files are accepted' }, { status: 400 })
  }

  const path = `${product.slug}/${documentType}-${Date.now().toString(36)}.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: uploadError } = await supabaseAdmin.storage
    .from('spec-documents')
    .upload(path, bytes, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ success: false, error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  const { data: pub } = supabaseAdmin.storage.from('spec-documents').getPublicUrl(path)
  const url = pub.publicUrl

  const { data: created, error: insertError } = await supabaseAdmin
    .from('product_documents')
    .insert({
      product_id: product.id,
      document_type: documentType,
      label,
      url,
      file_name: file.name.slice(0, 200),
      file_size: file.size,
      mime_type: file.type,
    })
    .select('*')
    .single()

  if (insertError) {
    return NextResponse.json({ success: false, error: insertError.message }, { status: 500 })
  }

  await logAudit({
    actor: session,
    action: 'product_document.uploaded',
    entityType: 'product_documents',
    entityId: created.id,
    after: { documentType, path, size: file.size },
  })

  return NextResponse.json({ success: true, data: created })
}
