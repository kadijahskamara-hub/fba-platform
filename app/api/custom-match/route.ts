import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { GLOSS_LEVELS, filterDimensionsPayload, type GlossLevel } from '@/lib/customMatch/logic'

// POST /api/custom-match — public Custom Match/COM submission (Sprint 13).
// Creates a REAL custom_match_requests record with an FBA-CM reference.
// Works for guests and signed-in users; the requester identity is always
// the SUBMITTED contact details (never the session — trade-application
// lesson, QA item 6). Attachments are uploaded separately right after.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const clean = (v: unknown, max = 300): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(`custom-match:${getClientIp(req)}`, 5, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many submissions. Please try again in a minute.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }

  const body = await req.json().catch(() => ({}))

  // Honeypot — bots fill it, humans never see it.
  if (typeof body.hp === 'string' && body.hp.trim() !== '') {
    return NextResponse.json({ success: true, data: { referenceNumber: 'FBA-CM-0000-0000' } })
  }

  // Product must exist and be published.
  const productId = clean(body.productId, 60)
  if (!productId) return NextResponse.json({ success: false, error: 'productId is required.' }, { status: 400 })
  const { data: product } = await supabaseAdmin
    .from('products').select('id, name, visibility, archived_at, deleted_at')
    .eq('id', productId).single()
  if (!product || product.visibility !== 'published' || product.archived_at || product.deleted_at) {
    return NextResponse.json({ success: false, error: 'Product not found.' }, { status: 404 })
  }

  // Requester contact — required, submitted values only.
  const requesterName = clean(body.requesterName, 200)
  const requesterEmail = clean(body.requesterEmail, 300)?.toLowerCase() ?? null
  if (!requesterName || !requesterEmail || !EMAIL_RE.test(requesterEmail)) {
    return NextResponse.json({ success: false, error: 'Your name and a valid email address are required.' }, { status: 400 })
  }
  const session = await getSession()
  const requesterUserId =
    session && session.email.toLowerCase().trim() === requesterEmail ? session.id : null

  // Material type (optional but validated when given).
  let materialTypeId: string | null = null
  let materialSlug = 'other'
  if (body.materialTypeId) {
    const { data: mt } = await supabaseAdmin
      .from('material_types').select('id, slug').eq('id', String(body.materialTypeId)).eq('is_active', true).maybeSingle()
    if (!mt) return NextResponse.json({ success: false, error: 'Unknown material type.' }, { status: 400 })
    materialTypeId = mt.id
    materialSlug = mt.slug as string
  }

  const glossRaw = clean(body.glossLevel, 40)
  const glossLevel = glossRaw && (GLOSS_LEVELS as readonly string[]).includes(glossRaw) ? (glossRaw as GlossLevel) : null

  const quantity = Math.min(999, Math.max(1, Number(body.quantity) || 1))

  // Standard finish selections at submission time: only option IDs are
  // trusted; labels come from OUR data and are stored as a snapshot.
  const rawSelections = Array.isArray(body.selections) ? (body.selections as Array<Record<string, unknown>>).slice(0, 20) : []
  const selectionSnapshot: Array<{ groupLabel: string; finishLabel: string; finishCode: string | null }> = []
  if (rawSelections.length > 0) {
    const ids = rawSelections.map(s => String(s.finishOptionId)).filter(Boolean)
    const { data: options } = await supabaseAdmin
      .from('product_finish_options')
      .select('id, finish:finishes(name, code), group:product_finish_groups(label, product_id)')
      .in('id', ids)
    for (const o of options ?? []) {
      const grp = o.group as unknown as { label?: string; product_id?: string } | null
      const fin = o.finish as unknown as { name?: string; code?: string | null } | null
      if (grp?.product_id !== productId) continue
      selectionSnapshot.push({
        groupLabel: grp?.label ?? '',
        finishLabel: fin?.name ?? '',
        finishCode: fin?.code ?? null,
      })
    }
  }

  const { data: request, error } = await supabaseAdmin.from('custom_match_requests').insert({
    product_id: productId,
    requester_user_id: requesterUserId,
    requester_name: requesterName,
    requester_studio: clean(body.requesterStudio, 200),
    requester_email: requesterEmail,
    requester_telephone: clean(body.requesterTelephone, 60),
    quantity,
    material_type_id: materialTypeId,
    application_component: clean(body.applicationComponent, 200),
    supplier_brand: clean(body.supplierBrand, 200),
    material_code: clean(body.materialCode, 120),
    sample_batch_reference: clean(body.sampleBatchReference, 120),
    requested_colour: clean(body.requestedColour, 120),
    gloss_level: glossLevel,
    grain_pattern_match: body.grainPatternMatch === true,
    stain_tone_match: body.stainToneMatch === true,
    exact_batch_match: body.exactBatchMatch === true,
    sheen_gloss_match: body.sheenGlossMatch === true,
    physical_sample_available: body.physicalSampleAvailable === true,
    physical_sample_status: body.physicalSampleAvailable === true ? 'client_has_sample' : 'none',
    sample_location: clean(body.sampleLocation, 300),
    fire_requirement: clean(body.fireRequirement, 200),
    performance_requirement: clean(body.performanceRequirement, 200),
    dimensions_application: filterDimensionsPayload(materialSlug, body.dimensions),
    selected_finishes_snapshot: selectionSnapshot,
    additional_notes: clean(body.additionalNotes, 3000),
    status: 'submitted',
    submitted_at: new Date().toISOString(),
    source_page: clean(body.sourcePage, 300),
  }).select('id, reference_number').single()

  if (error || !request) {
    console.error('custom_match_requests insert failed:', error?.message)
    return NextResponse.json({ success: false, error: 'We could not submit your request. Please try again.' }, { status: 500 })
  }

  await logAudit({
    actor: session ?? null, action: 'custom_match.submitted', entityType: 'custom_match_request',
    entityId: request.id, after: { reference: request.reference_number, product: product.name, requesterEmail },
  })

  return NextResponse.json({ success: true, data: { id: request.id, referenceNumber: request.reference_number } })
}
