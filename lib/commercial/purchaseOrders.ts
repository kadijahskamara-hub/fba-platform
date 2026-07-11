import 'server-only'
import { createHash, randomBytes } from 'crypto'
import { supabaseAdmin } from '../supabase'
import { logAudit } from '../audit'
import { getCommercialSettings } from './settings'
import {
  calculatePurchaseOrder, evaluatePoApproval, analyseMarginAtRisk,
  lineEligibleForProcurement, CalcPoResult, SupplierTaxCategory,
} from './poCalculations'
import type { SessionUser } from '../types'

// ============================================================
// Purchase-order server orchestration (Sprint 2).
//
// Client transaction (proformas) and supplier transaction
// (purchase_orders) are strictly separate. Nothing in this
// module ever copies a client selling price into a supplier
// record, and issued snapshots are immutable (DB triggers).
// ============================================================

// ── Commercial-order conversion ──────────────────────────────

export async function convertToCommercialOrder(params: {
  proformaId: string
  actor: SessionUser
  duplicateOverrideReason?: string | null   // Ultra Admin only (validated by caller)
}): Promise<{ order: Record<string, unknown> } | { error: string; status: number }> {
  const { proformaId, actor } = params

  const { data: pf } = await supabaseAdmin
    .from('proformas').select('*').eq('id', proformaId).single()
  if (!pf) return { error: 'Commercial record not found', status: 404 }

  // Eligibility (spec §5/§6): approved + issued, not blocked.
  if (['required_commercial', 'required_ultra', 'blocked'].includes(pf.approval_status)) {
    return { error: 'This record has outstanding pricing approvals and cannot become an order yet.', status: 409 }
  }
  if (!pf.locked_at) {
    return { error: 'Only an issued (or explicitly accepted) quote/pro forma can be converted to a commercial order. Issue it first.', status: 409 }
  }

  const { data: lines } = await supabaseAdmin
    .from('proforma_line_items').select('*').eq('proforma_id', proformaId)
    .order('sort_order', { ascending: true })

  const orderNumber = await nextNumber('next_sales_order_number')
  if (!orderNumber) return { error: 'Could not allocate a sales-order number.', status: 500 }

  const conversionSnapshot = {
    convertedAt: new Date().toISOString(),
    convertedBy: actor.email,
    source: {
      proforma_number: pf.proforma_number,
      quote_number: pf.quote_number,
      revision_number: pf.revision_number,
      invoice_number: pf.invoice_number,
    },
    totals: pf.totals ?? null,
    lines: (lines ?? []).map((l: Record<string, unknown>) => ({
      id: l.id, line_type: l.line_type, name: l.name, quantity: Number(l.quantity),
      unit_of_measure: l.unit_of_measure, manufacturer_id: l.manufacturer_id,
      supplier_cost_unit: l.supplier_cost_unit == null ? null : Number(l.supplier_cost_unit),
      supplier_cost_source: l.supplier_cost_source,
      line_net_total: l.line_net_total == null ? null : Number(l.line_net_total),
      tax_category: l.tax_category, section: l.section,
    })),
  }

  const { data: order, error } = await supabaseAdmin.from('commercial_orders').insert({
    order_number: orderNumber,
    source_proforma_id: proformaId,
    source_quote_number: pf.quote_number ?? pf.proforma_number,
    source_revision_number: pf.revision_number ?? 1,
    client_id: pf.contact_user_id ?? null,
    project_id: pf.project_id ?? null,
    status: 'accepted',
    currency: pf.currency ?? 'GBP',
    client_snapshot: {
      client_name: pf.client_name, client_email: pf.client_email,
      client_company: pf.client_company, billing_address: pf.billing_address,
    },
    project_snapshot: {
      project_name: pf.project_name, project_location: pf.project_location,
      delivery_address: pf.delivery_address,
    },
    commercial_snapshot: conversionSnapshot,
    duplicate_override_reason: params.duplicateOverrideReason ?? null,
    accepted_at: new Date().toISOString(),
    created_by: actor.id,
  }).select().single()

  if (error) {
    if (error.code === '23505') {
      return { error: 'A commercial order already exists for this quote revision. Ultra Admin can override with a recorded reason.', status: 409 }
    }
    return { error: 'Order creation failed.', status: 500 }
  }

  await logAudit({
    actor, action: 'commercial.sales_order_created', entityType: 'commercial_order', entityId: order.id,
    after: { orderNumber, sourceProforma: pf.proforma_number, revision: pf.revision_number },
  })
  return { order }
}

async function nextNumber(fn: 'next_sales_order_number' | 'next_purchase_order_number'): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc(fn)
  return error ? null : (data as string)
}

// ── Procurement readiness (per commercial order) ─────────────

export interface ProcurementLineView {
  sourceLine: Record<string, unknown>
  eligible: boolean
  allocation: Record<string, unknown> | null
  problems: string[]
}

export async function procurementState(commercialOrderId: string) {
  const { data: order } = await supabaseAdmin
    .from('commercial_orders')
    .select('*, source:proformas!commercial_orders_source_proforma_id_fkey(id, proforma_number, quote_number, revision_number, client_name, client_company, project_name)')
    .eq('id', commercialOrderId).single()
  if (!order) return null

  const { data: lines } = await supabaseAdmin
    .from('proforma_line_items')
    .select('*, manufacturer:artisans(id, name, is_active, default_currency, order_email), product:products(id, supplier_cost, supplier_currency, supplier_sku, min_order_qty)')
    .eq('proforma_id', order.source_proforma_id)
    .order('sort_order', { ascending: true })

  const { data: allocations } = await supabaseAdmin
    .from('supplier_allocations')
    .select('*, manufacturer:artisans(id, name, is_active, default_currency), po_lines:purchase_order_lines(id, purchase_order_id)')
    .eq('commercial_order_id', commercialOrderId)

  const { data: pos } = await supabaseAdmin
    .from('purchase_orders')
    .select('id, purchase_order_number, revision_number, status, manufacturer_id, margin_at_risk, grand_total, supplier_currency, issued_at')
    .eq('commercial_order_id', commercialOrderId)
    .order('created_at', { ascending: true })

  return { order, lines: lines ?? [], allocations: allocations ?? [], purchaseOrders: pos ?? [] }
}

// ── Draft PO generation (one manufacturer per PO) ────────────

export async function generateDraftPo(params: {
  commercialOrderId: string
  manufacturerId: string
  actor: SessionUser
}): Promise<{ po: Record<string, unknown> } | { error: string; status: number }> {
  const { commercialOrderId, manufacturerId, actor } = params

  const { data: order } = await supabaseAdmin
    .from('commercial_orders').select('*').eq('id', commercialOrderId).single()
  if (!order) return { error: 'Commercial order not found', status: 404 }
  if (order.status === 'cancelled') return { error: 'This commercial order is cancelled.', status: 409 }

  const { data: manufacturer } = await supabaseAdmin
    .from('artisans').select('*').eq('id', manufacturerId).single()
  if (!manufacturer) return { error: 'Manufacturer not found', status: 404 }

  // Allocations for THIS manufacturer only, not yet included in a PO.
  const { data: allocations } = await supabaseAdmin
    .from('supplier_allocations')
    .select('*, source_line:proforma_line_items(*)')
    .eq('commercial_order_id', commercialOrderId)
    .eq('manufacturer_id', manufacturerId)
    .in('allocation_status', ['allocated', 'ready_for_po'])
  if (!allocations || allocations.length === 0) {
    return { error: 'No open allocations for this manufacturer. Allocate lines first.', status: 400 }
  }

  // Never fabricate: every allocation must carry a real cost + currency.
  const notReady = allocations.filter(a => a.supplier_cost_unit == null || !a.supplier_currency)
  if (notReady.length > 0) {
    return { error: `${notReady.length} allocation(s) are missing supplier cost or currency. Resolve them or exclude the lines from procurement.`, status: 409 }
  }
  const currencies = [...new Set(allocations.map(a => a.supplier_currency))]
  if (currencies.length > 1) {
    return { error: `Allocations for this manufacturer use mixed currencies (${currencies.join(', ')}). Split them into separate POs.`, status: 409 }
  }

  const settings = await getCommercialSettings()
  const poNumber = await nextNumber('next_purchase_order_number')
  if (!poNumber) return { error: 'Could not allocate a PO number.', status: 500 }

  const ackDays = settings.default_acknowledgement_days ?? 5

  const { data: po, error } = await supabaseAdmin.from('purchase_orders').insert({
    purchase_order_number: poNumber,
    revision_number: 1,
    commercial_order_id: commercialOrderId,
    manufacturer_id: manufacturerId,
    status: 'draft',
    supplier_currency: currencies[0],
    order_date: new Date().toISOString().slice(0, 10),
    required_by_date: allocations.map(a => a.required_by_date).filter(Boolean).sort()[0] ?? null,
    acknowledgement_due_date: new Date(Date.now() + ackDays * 86400000).toISOString().slice(0, 10),
    supplier_contact_snapshot: {
      legal_name: manufacturer.legal_name ?? manufacturer.name,
      trading_name: manufacturer.trading_name ?? manufacturer.name,
      primary_contact_name: manufacturer.primary_contact_name,
      order_email: manufacturer.order_email,
      telephone: manufacturer.telephone,
      address: manufacturer.address,
      country: manufacturer.country,
      vat_or_tax_number: manufacturer.vat_or_tax_number,
      company_registration_number: manufacturer.company_registration_number,
    },
    delivery_address_snapshot: allocations[0].delivery_address_snapshot
      ?? (order.project_snapshot as Record<string, unknown> | null)?.delivery_address ?? null,
    payment_terms_snapshot: manufacturer.default_payment_terms ?? null,
    incoterms_snapshot: manufacturer.incoterms ?? null,
    supplier_recipient_email: manufacturer.order_email ?? null,
    created_by: actor.id,
  }).select().single()
  if (error || !po) return { error: 'PO creation failed.', status: 500 }

  // PO lines from allocations — SUPPLIER COST ONLY. Client selling values
  // are intentionally never read here.
  let sort = 0
  for (const a of allocations) {
    const src = (a.source_line ?? {}) as Record<string, unknown>
    await supabaseAdmin.from('purchase_order_lines').insert({
      purchase_order_id: po.id,
      supplier_allocation_id: a.id,
      source_line_item_id: a.source_line_item_id,
      product_id: src.product_id ?? a.supplier_product_id ?? null,
      supplier_sku: a.supplier_sku ?? (src.supplier_sku as string) ?? null,
      fba_sku: (src.fba_sku as string) ?? null,
      product_name_snapshot: (src.name as string) ?? 'Item',
      description_snapshot: (src.description as string) ?? null,
      specification_snapshot: (src.spec_details as string) ?? null,
      finish_snapshot: (src.selected_finish as string) ?? null,
      fabric_snapshot: (src.selected_fabric as string) ?? null,
      dimensions_snapshot: (src.selected_size as string) ?? null,
      image_snapshot: (src.image_url as string) ?? null,
      quantity: Number(a.quantity),
      unit_of_measure: a.unit_of_measure ?? 'each',
      supplier_cost_unit: Number(a.supplier_cost_unit),
      tax_category: 'unknown',   // must be explicitly confirmed before issue
      required_by_date: a.required_by_date,
      sort_order: sort++,
    })
    await supabaseAdmin.from('supplier_allocations')
      .update({ allocation_status: 'included_in_po', updated_at: new Date().toISOString() })
      .eq('id', a.id)
  }

  await recalcAndPersistPo(po.id)
  await updateOrderProgress(commercialOrderId)

  await logAudit({
    actor, action: 'commercial.po_created', entityType: 'purchase_order', entityId: po.id,
    after: { poNumber, manufacturer: manufacturer.name, lines: allocations.length },
  })
  return { po }
}

// ── Server-side recalculation + margin-at-risk ───────────────

export async function recalcAndPersistPo(poId: string): Promise<{ calc: CalcPoResult; po: Record<string, unknown> } | { error: string; status: number }> {
  const { data: po } = await supabaseAdmin.from('purchase_orders').select('*').eq('id', poId).single()
  if (!po) return { error: 'Purchase order not found', status: 404 }
  if (po.locked_at) return { error: 'This purchase order is issued and locked. Create a new revision to make changes.', status: 409 }

  const { data: lines } = await supabaseAdmin
    .from('purchase_order_lines').select('*, allocation:supplier_allocations(quantity, supplier_cost_unit, supplier_currency)')
    .eq('purchase_order_id', poId).order('sort_order', { ascending: true })

  const calc = calculatePurchaseOrder({
    lines: (lines ?? []).map(l => ({
      id: l.id,
      quantity: Number(l.quantity),
      supplierCostUnit: Number(l.supplier_cost_unit),
      discountAmount: Number(l.discount_amount ?? 0),
      taxCategory: (l.tax_category ?? 'unknown') as SupplierTaxCategory,
      taxRate: l.tax_rate_snapshot == null ? null : Number(l.tax_rate_snapshot),
    })),
    shippingTotal: Number(po.shipping_total ?? 0),
    packagingTotal: Number(po.packaging_total ?? 0),
    otherChargesTotal: Number(po.other_charges_total ?? 0),
    documentDiscount: Number(po.discount_total ?? 0),
    chargesTaxRate: null,
  })

  // Persist line totals
  for (const lr of calc.lines) {
    if (!lr.id) continue
    await supabaseAdmin.from('purchase_order_lines').update({
      line_net_total: lr.lineNetTotal,
      line_tax_total: lr.lineTaxTotal,
      line_gross_total: lr.lineGrossTotal,
      updated_at: new Date().toISOString(),
    }).eq('id', lr.id)
  }

  // ── Margin-at-risk: compare PO cost against the source client order ──
  const settings = await getCommercialSettings()
  const { data: order } = await supabaseAdmin
    .from('commercial_orders').select('commercial_snapshot').eq('id', po.commercial_order_id).single()
  const snapLines = ((order?.commercial_snapshot as Record<string, unknown> | null)?.lines ?? []) as Array<Record<string, unknown>>

  const sourceIds = new Set((lines ?? []).map(l => l.source_line_item_id).filter(Boolean))
  const covered = snapLines.filter(sl => sourceIds.has(sl.id))
  const clientNetSelling = covered.reduce((s, sl) => s + Number(sl.line_net_total ?? 0), 0)
  const originalExpectedCost = covered.reduce((s, sl) => {
    const c = sl.supplier_cost_unit == null ? null : Number(sl.supplier_cost_unit)
    return s + (c == null ? 0 : c * Number(sl.quantity ?? 0))
  }, 0)

  const margin = analyseMarginAtRisk({
    clientNetSelling,
    originalExpectedCost,
    currentPoCost: calc.netSubtotal,
    marginCommercialBelow: settings.approval_thresholds.margin_commercial_below,
    marginUltraBelow: settings.approval_thresholds.margin_ultra_below,
  })

  // ── Approval evaluation ──
  const { data: manufacturer } = await supabaseAdmin
    .from('artisans').select('is_active, default_currency').eq('id', po.manufacturer_id).single()

  const costDiffers = (lines ?? []).some(l =>
    l.allocation && l.allocation.supplier_cost_unit != null &&
    Number(l.supplier_cost_unit) !== Number(l.allocation.supplier_cost_unit))
  const qtyDiffers = (lines ?? []).some(l =>
    l.allocation && Number(l.quantity) !== Number(l.allocation.quantity))

  const approval = evaluatePoApproval(calc, {
    valueThreshold: settings.po_value_approval_threshold == null ? null : Number(settings.po_value_approval_threshold),
    freightThreshold: settings.po_freight_approval_threshold == null ? null : Number(settings.po_freight_approval_threshold),
    manufacturerActive: manufacturer?.is_active !== false,
    costDiffersFromAllocation: costDiffers,
    quantityDiffersFromAllocation: qtyDiffers,
    currencyDiffersFromDefault: Boolean(manufacturer?.default_currency && po.supplier_currency !== manufacturer.default_currency),
    costOverridden: (lines ?? []).some(l => l.cost_overridden),
    marginAtRisk: margin.atRisk,
  })

  const previous = po.approval_status as string
  const approvalStatus = approval.blocked
    ? 'blocked'
    : approval.required
      ? (previous === 'approved' ? 'approved' : 'required')
      : 'none'

  const marginWasAtRisk = Boolean(po.margin_at_risk)
  await supabaseAdmin.from('purchase_orders').update({
    subtotal: calc.netSubtotal,
    tax_total: calc.taxTotal,
    grand_total: calc.grandTotal,
    totals: {
      lineSubtotal: calc.lineSubtotal,
      discountTotal: calc.discountTotal,
      shippingTotal: calc.shippingTotal,
      packagingTotal: calc.packagingTotal,
      otherChargesTotal: calc.otherChargesTotal,
      netSubtotal: calc.netSubtotal,
      taxByCategory: calc.taxByCategory,
      taxTotal: calc.taxTotal,
      grandTotal: calc.grandTotal,
      hasUnknownTax: calc.hasUnknownTax,
      approvalReasons: approval.reasons,
      calculatedAt: new Date().toISOString(),
    },
    approval_status: approvalStatus,
    approval_reason: approval.reasons.join(' ') || null,
    margin_at_risk: margin.atRisk,
    margin_analysis: margin,   // internal-only jsonb; stripped from supplier output
    updated_at: new Date().toISOString(),
  }).eq('id', poId)

  if (margin.atRisk && !marginWasAtRisk) {
    await logAudit({
      actor: null, action: 'commercial.margin_at_risk', entityType: 'purchase_order', entityId: poId,
      after: { level: margin.level, costVariance: margin.costVariance, expectedMarginPercent: margin.expectedMarginPercent },
    })
  }

  const { data: fresh } = await supabaseAdmin.from('purchase_orders').select('*').eq('id', poId).single()
  return { calc, po: fresh ?? po }
}

async function updateOrderProgress(commercialOrderId: string) {
  const { data: allocs } = await supabaseAdmin
    .from('supplier_allocations').select('allocation_status')
    .eq('commercial_order_id', commercialOrderId)
    .neq('allocation_status', 'cancelled')
  const total = allocs?.length ?? 0
  const inPo = allocs?.filter(a => a.allocation_status === 'included_in_po').length ?? 0
  const status = total === 0 ? 'accepted' : inPo === 0 ? 'procurement_ready' : inPo < total ? 'partially_ordered' : 'fully_ordered'
  await supabaseAdmin.from('commercial_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', commercialOrderId)
    .not('status', 'in', '(cancelled,completed,in_progress,partially_delivered)')
}

// ── Issue: snapshot + acknowledgement token ──────────────────

export function poDocumentNumber(poNumber: string, revision: number): string {
  return revision <= 1 ? poNumber : `${poNumber}-R${String(revision).padStart(2, '0')}`
}

export function hashAckToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

export async function issuePurchaseOrder(params: {
  poId: string
  actor: SessionUser
}): Promise<{ snapshotId: string; documentNumber: string; ackToken: string; ackUrl: string } | { error: string; status: number }> {
  const { poId, actor } = params

  // Authoritative recalculation first (also refuses locked POs).
  const recalc = await recalcAndPersistPo(poId)
  if ('error' in recalc) return recalc
  const po = recalc.po

  if (po.status === 'cancelled') return { error: 'This purchase order is cancelled.', status: 409 }
  if (recalc.calc.hasUnknownTax) {
    return { error: 'Supplier tax treatment is unknown on one or more lines. Confirm the tax category for every line before issue.', status: 409 }
  }
  if (po.approval_status === 'blocked') {
    return { error: 'This purchase order is blocked. Ultra Admin must resolve the blocking condition.', status: 409 }
  }
  if (po.approval_status === 'required') {
    return { error: 'This purchase order requires approval before it can be issued.', status: 409 }
  }
  if (po.margin_at_risk && !po.margin_resolution) {
    return { error: 'This order is flagged margin-at-risk. Record a resolution note before issue.', status: 409 }
  }

  const revision = Number(po.revision_number ?? 1)
  const documentNumber = poDocumentNumber(po.purchase_order_number as string, revision)
  const snapshot = await buildPoSnapshotPayload(po, actor.email)

  const { data: snap, error: snapErr } = await supabaseAdmin
    .from('purchase_order_snapshots')
    .insert({
      purchase_order_id: poId,
      revision,
      document_number: documentNumber,
      snapshot,
      issued_by: actor.id,
    })
    .select('id').single()
  if (snapErr || !snap) return { error: snapErr?.message ?? 'Snapshot failed', status: 500 }

  // Revoke any previous active tokens, then mint a fresh single-purpose one.
  await supabaseAdmin.from('purchase_order_ack_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('purchase_order_id', poId)
    .is('revoked_at', null)

  const rawToken = randomBytes(32).toString('base64url')  // 256-bit entropy
  const settings = await getCommercialSettings()
  const ackDays = Math.max(Number(po.acknowledgement_due_date
    ? Math.ceil((new Date(po.acknowledgement_due_date as string).getTime() - Date.now()) / 86400000)
    : settings.default_acknowledgement_days ?? 5), 1)
  await supabaseAdmin.from('purchase_order_ack_tokens').insert({
    purchase_order_id: poId,
    revision,
    token_hash: hashAckToken(rawToken),
    expires_at: new Date(Date.now() + (ackDays + 9) * 86400000).toISOString(), // deadline + grace
    created_by: actor.id,
  })

  await supabaseAdmin.from('purchase_orders').update({
    status: 'issued',
    issued_by: actor.id,
    issued_at: new Date().toISOString(),
    locked_at: new Date().toISOString(),
    send_status: 'approved_not_sent',   // honest: no email dispatched by this action
    updated_at: new Date().toISOString(),
  }).eq('id', poId)

  await logAudit({
    actor, action: 'commercial.po_issued', entityType: 'purchase_order', entityId: poId,
    after: { documentNumber, revision },
  })

  return {
    snapshotId: snap.id,
    documentNumber,
    ackToken: rawToken,
    ackUrl: `/supplier/purchase-orders/${rawToken}`,
  }
}

/**
 * Build the supplier-safe snapshot payload for a PO (issue or draft
 * preview). Contains supplier costs and specifications ONLY — no client
 * selling prices, margins, client fees, other manufacturers, margin
 * analysis, or internal notes.
 */
export async function buildPoSnapshotPayload(po: Record<string, unknown>, actorEmail: string): Promise<Record<string, unknown>> {
  const poId = po.id as string
  const revision = Number(po.revision_number ?? 1)
  const documentNumber = poDocumentNumber(po.purchase_order_number as string, revision)

  const { data: lines } = await supabaseAdmin
    .from('purchase_order_lines').select('*').eq('purchase_order_id', poId)
    .order('sort_order', { ascending: true })

  const { data: order } = await supabaseAdmin
    .from('commercial_orders').select('order_number, project_snapshot').eq('id', po.commercial_order_id).single()

  const totals = (po.totals ?? {}) as Record<string, unknown>

  return {
    documentNumber,
    revision,
    issuedAt: new Date().toISOString(),
    issuedByEmail: actorEmail,
    po: {
      purchase_order_number: po.purchase_order_number,
      order_date: po.order_date,
      required_by_date: po.required_by_date,
      acknowledgement_due_date: po.acknowledgement_due_date,
      supplier_currency: po.supplier_currency,
      supplier_contact: po.supplier_contact_snapshot,
      delivery_address: po.delivery_address_snapshot,
      payment_terms: po.payment_terms_snapshot,
      incoterms: po.incoterms_snapshot,
      supplier_notes: po.supplier_notes,
      commercial_order_reference: order?.order_number ?? null,
      project_reference: ((order?.project_snapshot as Record<string, unknown> | null)?.project_name as string) ?? null,
    },
    lines: (lines ?? []).map(l => ({
      product_name: l.product_name_snapshot,
      description: l.description_snapshot,
      specification: l.specification_snapshot,
      finish: l.finish_snapshot,
      fabric: l.fabric_snapshot,
      dimensions: l.dimensions_snapshot,
      image: l.image_snapshot,
      supplier_sku: l.supplier_sku,
      fba_sku: l.fba_sku,
      quantity: Number(l.quantity),
      unit_of_measure: l.unit_of_measure,
      supplier_cost_unit: Number(l.supplier_cost_unit),
      discount_amount: Number(l.discount_amount ?? 0),
      tax_category: l.tax_category,
      tax_rate: l.tax_rate_snapshot == null ? null : Number(l.tax_rate_snapshot),
      line_net_total: Number(l.line_net_total ?? 0),
      line_tax_total: Number(l.line_tax_total ?? 0),
      line_gross_total: Number(l.line_gross_total ?? 0),
      required_by_date: l.required_by_date,
      supplier_notes: l.supplier_notes,
    })),
    charges: {
      shipping: Number(po.shipping_total ?? 0),
      packaging: Number(po.packaging_total ?? 0),
      other: Number(po.other_charges_total ?? 0),
      other_description: po.other_charges_description ?? null,
      discount: Number(po.discount_total ?? 0),
    },
    totals: {
      netSubtotal: Number(totals.netSubtotal ?? po.subtotal ?? 0),
      taxTotal: Number(totals.taxTotal ?? po.tax_total ?? 0),
      grandTotal: Number(totals.grandTotal ?? po.grand_total ?? 0),
      taxByCategory: (totals.taxByCategory ?? {}) as Record<string, number>,
    },
  }
}

// ── Revision ─────────────────────────────────────────────────

export async function revisePurchaseOrder(params: {
  poId: string
  reason: string
  actor: SessionUser
}): Promise<{ revision: number } | { error: string; status: number }> {
  const { poId, reason, actor } = params
  const { data: po } = await supabaseAdmin
    .from('purchase_orders').select('id, revision_number, locked_at, status, purchase_order_number').eq('id', poId).single()
  if (!po) return { error: 'Purchase order not found', status: 404 }
  if (!po.locked_at) return { error: 'This purchase order is not issued — edit it directly.', status: 400 }

  const newRevision = Number(po.revision_number ?? 1) + 1

  // Invalidate the previous acknowledgement token(s).
  await supabaseAdmin.from('purchase_order_ack_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('purchase_order_id', poId)
    .is('revoked_at', null)

  await supabaseAdmin.from('purchase_orders').update({
    revision_number: newRevision,
    superseded_by_revision: newRevision,
    status: 'revised',
    approval_status: 'none',
    approved_by: null,
    approved_at: null,
    issued_by: null,
    issued_at: null,
    locked_at: null,
    send_status: 'not_prepared',
    acknowledged_by_name: null,
    acknowledged_by_email: null,
    acknowledged_at: null,
    acknowledgement_notes: null,
    updated_at: new Date().toISOString(),
  }).eq('id', poId)

  await recalcAndPersistPo(poId)

  await logAudit({
    actor, action: 'commercial.po_revised', entityType: 'purchase_order', entityId: poId,
    before: { revision: po.revision_number }, after: { revision: newRevision, reason },
  })
  return { revision: newRevision }
}

// ── Token resolution (public acknowledgement route) ──────────

export async function resolveAckToken(rawToken: string): Promise<
  | { po: Record<string, unknown>; snapshot: Record<string, unknown>; tokenRow: Record<string, unknown> }
  | { error: string; status: number }
> {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 100 || !/^[A-Za-z0-9_-]+$/.test(rawToken)) {
    return { error: 'Invalid link.', status: 400 }
  }
  const hash = hashAckToken(rawToken)
  const { data: tokenRow } = await supabaseAdmin
    .from('purchase_order_ack_tokens').select('*').eq('token_hash', hash).single()
  if (!tokenRow) return { error: 'This link is not valid.', status: 404 }
  if (tokenRow.revoked_at) return { error: 'This link has been superseded. Please use the most recent purchase order link.', status: 410 }
  if (new Date(tokenRow.expires_at) < new Date()) return { error: 'This link has expired. Please contact Full Bloom Artelier for a new one.', status: 410 }

  const { data: po } = await supabaseAdmin
    .from('purchase_orders').select('*').eq('id', tokenRow.purchase_order_id).single()
  if (!po) return { error: 'Purchase order not found.', status: 404 }
  if (po.status === 'cancelled') return { error: 'This purchase order has been cancelled.', status: 410 }

  const { data: snap } = await supabaseAdmin
    .from('purchase_order_snapshots')
    .select('*')
    .eq('purchase_order_id', tokenRow.purchase_order_id)
    .eq('revision', tokenRow.revision)
    .single()
  if (!snap) return { error: 'Purchase order document unavailable.', status: 404 }

  return { po, snapshot: snap.snapshot as Record<string, unknown>, tokenRow }
}
