import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { recalculateAndPersist } from '@/lib/commercial/recalc'
import { logAudit } from '@/lib/audit'
import { PROFORMA_STAGE_KEYS } from '@/lib/pipeline'
import {
  ValidationError, vUuid, vString, vDate, vPercent, vNumber, vEnum,
} from '@/lib/commercial/validation'
import { verifyClientTotals } from '@/lib/commercial/calculations'

// GET /api/admin/proformas/:id — full document with items, downloads,
// issued document history, and contact.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('quote_pipeline_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('proformas')
    .select(`
      *,
      items:proforma_line_items(*, manufacturer:artisans(id, name), product:products(images), service:service_catalogue(id, code, name, pricing_type, default_unit)),
      downloads:proforma_downloads(*, manufacturer:artisans(id, name)),
      issued:issued_documents(id, doc_type, document_number, revision, issued_at, issued_by),
      contact:users!proformas_contact_user_id_fkey(id, first_name, last_name, email, role)
    `)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  if (Array.isArray(data.items)) {
    data.items.sort((a: { sort_order?: number }, b: { sort_order?: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }
  if (Array.isArray(data.issued)) {
    data.issued.sort((a: { issued_at: string }, b: { issued_at: string }) => b.issued_at.localeCompare(a.issued_at))
  }

  // Cost/margin visibility: strip internal commercial figures for users
  // without pricing rights (UI hiding is not security — this is API-level).
  const canSeeCost = cs.permissions.has('quote_price_edit') || cs.isUltraAdmin
  if (!canSeeCost && Array.isArray(data.items)) {
    for (const it of data.items) {
      it.supplier_cost_unit = null
      it.line_cost_total = null
      it.pricing_percent = null
    }
    if (data.totals) {
      delete (data.totals as Record<string, unknown>).productCostSubtotal
      delete (data.totals as Record<string, unknown>).effectiveMarkupPercent
      delete (data.totals as Record<string, unknown>).effectiveMarginPercent
    }
  }

  return NextResponse.json({
    success: true,
    data,
    permissions: {
      canEdit: cs.permissions.has('quote_edit'),
      canPriceEdit: cs.permissions.has('quote_price_edit'),
      canDiscountOverride: cs.permissions.has('quote_discount_override'),
      canApprove: cs.permissions.has('quote_approve'),
      canIssueInvoice: cs.permissions.has('invoice_issue'),
      isUltraAdmin: cs.isUltraAdmin,
    },
  })
}

// PATCH /api/admin/proformas/:id — update header / stage.
// Issued (locked) documents reject all edits.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('quote_edit')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    vUuid(params.id, 'id')
    body = await req.json()
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof ValidationError ? e.message : 'Invalid request' }, { status: 400 })
  }

  const { data: before, error: fErr } = await supabaseAdmin
    .from('proformas')
    .select('id, stage, proforma_number, quote_number, locked_at, document_status, totals')
    .eq('id', params.id).single()
  if (fErr || !before) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  // Stage moves are pipeline metadata and stay possible after issue;
  // every other header field is frozen once issued.
  const stageOnly = Object.keys(body).every(k => ['stage', 'lostReason', 'lost_reason'].includes(k))
  if (before.locked_at && !stageOnly) {
    return NextResponse.json({ success: false, error: 'This document has been issued and is locked. Create a new revision to make changes.' }, { status: 409 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  let commercialChange = false

  try {
    if (body.stage !== undefined) {
      const stage = vEnum(body.stage, 'stage', PROFORMA_STAGE_KEYS as unknown as readonly string[], { required: true })
      if (stage === 'lost' && !body.lostReason && !body.lost_reason) {
        return NextResponse.json({ success: false, error: 'A reason is required to mark a proforma Lost.' }, { status: 400 })
      }
      updates.stage = stage
      if (stage !== 'lost') updates.lost_reason = null
    }
    if (body.lostReason !== undefined) updates.lost_reason = vString(body.lostReason, 'lostReason', { max: 200 })
    if (body.lost_reason !== undefined) updates.lost_reason = vString(body.lost_reason, 'lost_reason', { max: 200 })

    const textMap: Record<string, string> = {
      clientName: 'client_name', clientEmail: 'client_email', clientCompany: 'client_company',
      projectName: 'project_name', projectLocation: 'project_location',
      billingAddress: 'billing_address', deliveryAddress: 'delivery_address',
      notes: 'notes', adminNotes: 'admin_notes', leadTime: 'lead_time',
      deliveryNotes: 'delivery_notes', paymentTerms: 'payment_terms',
    }
    for (const [camel, snake] of Object.entries(textMap)) {
      if (body[camel] !== undefined) updates[snake] = vString(body[camel], camel, { max: 5000 })
    }
    if (body.currency !== undefined) updates.currency = vString(body.currency, 'currency', { max: 3 }) ?? 'GBP'
    if (body.contactUserId !== undefined) updates.contact_user_id = body.contactUserId ? vUuid(body.contactUserId, 'contactUserId') : null
    if (body.projectId !== undefined) updates.project_id = body.projectId ? vUuid(body.projectId, 'projectId') : null
    if (body.validUntil !== undefined) updates.valid_until = vDate(body.validUntil, 'validUntil')
    if (body.quoteDate !== undefined) updates.quote_date = vDate(body.quoteDate, 'quoteDate')
    if (body.invoiceDate !== undefined) updates.invoice_date = vDate(body.invoiceDate, 'invoiceDate')
    if (body.invoiceDueDate !== undefined) updates.invoice_due_date = vDate(body.invoiceDueDate, 'invoiceDueDate')

    // ── Commercial fields: require pricing rights ──
    const priceFields = ['vatRate', 'depositPercent', 'depositBasis', 'pricingMethod', 'defaultTaxCategory',
      'procurementFeeType', 'procurementFeeBasis', 'procurementFeeValue', 'procurementFeeManualBase',
      'procurementFeeOverride', 'procurementFeeOverrideReason', 'depositOverrideReason'] as const
    const touchesPricing = priceFields.some(f => body[f] !== undefined)
    if (touchesPricing && !cs.permissions.has('quote_price_edit')) {
      return NextResponse.json({ success: false, error: 'You do not have permission to change pricing settings on quotes.' }, { status: 403 })
    }
    if (body.vatRate !== undefined) { updates.vat_rate = vPercent(body.vatRate, 'vatRate', true); commercialChange = true }
    if (body.depositPercent !== undefined) { updates.deposit_percent = vPercent(body.depositPercent, 'depositPercent', true); commercialChange = true }
    if (body.depositBasis !== undefined) { updates.deposit_basis = vEnum(body.depositBasis, 'depositBasis', ['gross_total', 'net_subtotal'] as const, { required: true }); commercialChange = true }
    if (body.depositOverrideReason !== undefined) updates.deposit_override_reason = vString(body.depositOverrideReason, 'depositOverrideReason', { max: 500 })
    if (body.pricingMethod !== undefined) { updates.pricing_method = vEnum(body.pricingMethod, 'pricingMethod', ['markup', 'margin'] as const, { required: true }); commercialChange = true }
    if (body.defaultTaxCategory !== undefined) { updates.default_tax_category = vEnum(body.defaultTaxCategory, 'defaultTaxCategory', ['standard', 'reduced', 'zero', 'exempt', 'outside_scope'] as const, { required: true }); commercialChange = true }
    if (body.procurementFeeType !== undefined) { updates.procurement_fee_type = vEnum(body.procurementFeeType, 'procurementFeeType', ['percentage', 'fixed', 'tiered', 'none'] as const, { required: true }); commercialChange = true }
    if (body.procurementFeeBasis !== undefined) { updates.procurement_fee_basis = vEnum(body.procurementFeeBasis, 'procurementFeeBasis', ['product_selling_subtotal', 'product_cost_subtotal', 'approved_procurement_value', 'selected_lines', 'manual_base_amount'] as const, { required: true }); commercialChange = true }
    if (body.procurementFeeValue !== undefined) { updates.procurement_fee_value = vNumber(body.procurementFeeValue, 'procurementFeeValue', { min: 0 }); commercialChange = true }
    if (body.procurementFeeManualBase !== undefined) { updates.procurement_fee_manual_base = vNumber(body.procurementFeeManualBase, 'procurementFeeManualBase', { min: 0 }); commercialChange = true }
    if (body.procurementFeeOverride !== undefined) {
      updates.procurement_fee_override = body.procurementFeeOverride === null ? null : vNumber(body.procurementFeeOverride, 'procurementFeeOverride', { min: 0 })
      commercialChange = true
      if (updates.procurement_fee_override !== null && !body.procurementFeeOverrideReason) {
        return NextResponse.json({ success: false, error: 'A reason is required to override the procurement fee.' }, { status: 400 })
      }
    }
    if (body.procurementFeeOverrideReason !== undefined) updates.procurement_fee_override_reason = vString(body.procurementFeeOverrideReason, 'procurementFeeOverrideReason', { max: 500 })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    throw e
  }

  const { error } = await supabaseAdmin
    .from('proformas').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ success: false, error: 'Update failed.' }, { status: 500 })

  // Authoritative server-side recalculation (skipped for stage-only moves
  // on locked docs).
  let recalcResult: Awaited<ReturnType<typeof recalculateAndPersist>> | null = null
  if (!before.locked_at) {
    recalcResult = await recalculateAndPersist(params.id, { resetApproval: commercialChange })
    // Anti-tampering: if the client claimed totals, verify them.
    if (recalcResult && !('error' in recalcResult) && body.clientTotals && typeof body.clientTotals === 'object') {
      const mismatches = verifyClientTotals(body.clientTotals as Record<string, number>, recalcResult.result)
      if (mismatches.length > 0) {
        return NextResponse.json({ success: false, error: `Client totals rejected: ${mismatches.join('; ')}` }, { status: 422 })
      }
    }
  }

  if (updates.stage && updates.stage !== before.stage) {
    await logAudit({
      actor: cs.user, action: 'proforma.stage_changed', entityType: 'proforma', entityId: params.id,
      before: { stage: before.stage }, after: { stage: updates.stage, lostReason: updates.lost_reason ?? null },
    })
  } else {
    await logAudit({
      actor: cs.user, action: 'commercial.quote_updated', entityType: 'proforma', entityId: params.id,
      after: { fields: Object.keys(updates).filter(k => k !== 'updated_at') },
    })
  }

  const { data } = await supabaseAdmin.from('proformas').select('*').eq('id', params.id).single()
  return NextResponse.json({ success: true, data })
}

// DELETE /api/admin/proformas/:id — drafts only; issued documents are
// permanent records and cannot be deleted.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('quote_edit')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const { data: pf } = await supabaseAdmin
    .from('proformas').select('id, proforma_number, locked_at, document_status').eq('id', params.id).single()
  if (!pf) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  if (pf.locked_at || pf.document_status === 'issued') {
    return NextResponse.json({ success: false, error: 'Issued documents cannot be deleted. Cancellations require a credit note (Finance / Ultra Admin).' }, { status: 409 })
  }

  const { error } = await supabaseAdmin.from('proformas').delete().eq('id', params.id)
  if (error) return NextResponse.json({ success: false, error: 'Delete failed.' }, { status: 500 })

  await logAudit({ actor: cs.user, action: 'proforma.deleted', entityType: 'proforma', entityId: params.id, before: { number: pf.proforma_number } })
  return NextResponse.json({ success: true })
}
