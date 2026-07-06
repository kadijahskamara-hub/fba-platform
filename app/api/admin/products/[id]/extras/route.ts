import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

// ============================================================
// Product sub-resources: documents / finishes / variants
// GET  → all three lists for the product
// POST → { kind: 'document'|'finish'|'variant', action: 'create'|'update'|'delete', id?, data? }
// Field allowlists per kind (mass-assignment protection).
// ============================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DOC_TYPES = [
  'product_specification', 'upholstery_program', 'material_finishes',
  'tear_sheet', 'technical_passport', 'care_maintenance', 'installation_guide', 'warranty',
]

const KINDS: Record<string, { table: string; fields: string[] }> = {
  document: {
    table: 'product_documents',
    fields: ['document_type', 'label', 'url', 'file_name', 'mime_type', 'sort_order'],
  },
  finish: {
    table: 'product_finishes',
    fields: ['finish_category', 'finish_name', 'finish_code', 'material', 'colour', 'swatch_url', 'com_accepted', 'rub_count', 'fire_treatment', 'is_default', 'availability', 'sort_order'],
  },
  variant: {
    table: 'product_variants',
    fields: ['variant_name', 'width', 'height', 'depth', 'diameter', 'seat_height', 'weight_kg', 'unit', 'price_override', 'trade_price_override', 'lead_time_override', 'availability', 'sort_order'],
  },
}

async function guard(productId: string) {
  const session = await getSession()
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) }
  }
  if (!UUID_RE.test(productId)) {
    return { error: NextResponse.json({ success: false, error: 'Invalid product id' }, { status: 400 }) }
  }
  const { data: product } = await supabaseAdmin.from('products').select('id, name').eq('id', productId).single()
  if (!product) {
    return { error: NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 }) }
  }
  return { session, product }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id)
  if ('error' in g) return g.error

  const [{ data: documents }, { data: finishes }, { data: variants }] = await Promise.all([
    supabaseAdmin.from('product_documents').select('*').eq('product_id', params.id).order('sort_order'),
    supabaseAdmin.from('product_finishes').select('*').eq('product_id', params.id).order('sort_order'),
    supabaseAdmin.from('product_variants').select('*').eq('product_id', params.id).order('sort_order'),
  ])

  return NextResponse.json({ success: true, documents: documents ?? [], finishes: finishes ?? [], variants: variants ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id)
  if ('error' in g) return g.error
  const { session } = g

  let body: { kind?: string; action?: string; id?: string; data?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const kind = KINDS[body.kind ?? '']
  if (!kind) return NextResponse.json({ success: false, error: 'Unknown kind' }, { status: 400 })
  const action = body.action
  if (!['create', 'update', 'delete'].includes(action ?? '')) {
    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
  }

  // Allowlisted payload
  const data: Record<string, unknown> = {}
  for (const f of kind.fields) {
    if (body.data && body.data[f] !== undefined) data[f] = body.data[f]
  }

  // Validation
  if (body.kind === 'document') {
    if (data.document_type !== undefined && !DOC_TYPES.includes(data.document_type as string)) {
      return NextResponse.json({ success: false, error: 'Invalid document type' }, { status: 400 })
    }
    if (data.url !== undefined && !/^https:\/\/.+/.test(data.url as string)) {
      return NextResponse.json({ success: false, error: 'Document URL must start with https://' }, { status: 400 })
    }
  }
  if (body.kind === 'finish' && data.finish_category !== undefined && !['hard_finish', 'upholstery'].includes(data.finish_category as string)) {
    return NextResponse.json({ success: false, error: 'Invalid finish category' }, { status: 400 })
  }

  if (action === 'create') {
    const { data: created, error } = await supabaseAdmin
      .from(kind.table)
      .insert({ ...data, product_id: params.id })
      .select('*')
      .single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    await logAudit({ actor: session, action: `product_${body.kind}.created`, entityType: kind.table, entityId: created.id, after: data })
    return NextResponse.json({ success: true, data: created })
  }

  // update / delete require a row id belonging to this product
  if (!body.id || !UUID_RE.test(body.id)) {
    return NextResponse.json({ success: false, error: 'Row id required' }, { status: 400 })
  }

  if (action === 'update') {
    const { data: updated, error } = await supabaseAdmin
      .from(kind.table)
      .update(data)
      .eq('id', body.id)
      .eq('product_id', params.id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    await logAudit({ actor: session, action: `product_${body.kind}.updated`, entityType: kind.table, entityId: body.id, after: data })
    return NextResponse.json({ success: true, data: updated })
  }

  // delete
  const { error } = await supabaseAdmin
    .from(kind.table)
    .delete()
    .eq('id', body.id)
    .eq('product_id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  await logAudit({ actor: session, action: `product_${body.kind}.deleted`, entityType: kind.table, entityId: body.id })
  return NextResponse.json({ success: true })
}
