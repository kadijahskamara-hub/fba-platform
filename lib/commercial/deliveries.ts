import 'server-only'
import { randomBytes } from 'crypto'
import { supabaseAdmin } from '../supabase'
import { logAudit } from '../audit'
import { getCommercialSettings } from './settings'
import { hashToken } from './acceptance'
import { nextDeliveryNumber, nextInstallationNumber } from './numbering'
import {
  canDispatch, canRecordPod, canTransitionDispatch, canTransitionInstallation,
  computeDeliveryCoverage, findForbiddenDeliveryFields, statusCountsAsActive, validateAssignQuantity,
  type DeliveryLineQty, type DeliveryNoteSnapshot, type DispatchStatus,
  type InstallationStatus, type LineCoverage, type LineExceptionQty, type OriginType,
} from './deliveryLogic'
import type { SessionUser } from '../types'

// ============================================================
// Deliveries, proof of delivery & installations (Sprint 4).
//
// Mirrors the Sprint 2/3 domain modules: reads via the service-
// role client, state changes via atomic SECURITY DEFINER SQL
// functions (dispatch_delivery / record_delivery_pod), immutable
// no-price snapshots at issue, hashed confirmation tokens.
// ============================================================

interface DomainErr { error: string; status: number }
export type DomainResult<T> = { data: T } | DomainErr
export function isErr<T>(r: DomainResult<T>): r is DomainErr { return (r as DomainErr).error !== undefined }

export const POD_BUCKET = 'delivery-pod'

// ─────────────────────────────────────────────────────────────
// Order-level delivery state (Deliveries tab payload)
// ─────────────────────────────────────────────────────────────

export async function orderDeliveryState(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from('commercial_orders')
    .select('*, source:proformas!commercial_orders_source_proforma_id_fkey(id, proforma_number, quote_number, revision_number, client_name, client_company, project_name)')
    .eq('id', orderId).single()
  if (!order) return null

  const [{ data: locations }, { data: deliveries }, { data: installations }, { data: sourceLines }] = await Promise.all([
    supabaseAdmin.from('delivery_locations')
      .select('*, contacts:site_contacts(*)')
      .eq('commercial_order_id', orderId).order('created_at'),
    supabaseAdmin.from('deliveries')
      .select('*, location:delivery_locations(*), manufacturer:artisans(id, name), lines:delivery_lines(*, source_line:proforma_line_items(id, name, quantity, unit_of_measure, line_type)), packages:delivery_packages(*), pods:proof_of_delivery(*, photos:pod_photos(*))')
      .eq('commercial_order_id', orderId).order('created_at'),
    supabaseAdmin.from('installations')
      .select('*, linked_delivery:deliveries(id, delivery_number)')
      .eq('commercial_order_id', orderId).order('created_at'),
    supabaseAdmin.from('proforma_line_items')
      .select('id, name, quantity, unit_of_measure, line_type, section, manufacturer_id')
      .eq('proforma_id', (order.source as { id?: string } | null)?.id ?? '')
      .order('sort_order'),
  ])

  // Exceptions for all delivery lines on this order.
  const deliveryLineIds = (deliveries ?? []).flatMap(d =>
    ((d.lines ?? []) as Array<Record<string, unknown>>).map(l => l.id as string))
  let exceptions: Array<Record<string, unknown>> = []
  if (deliveryLineIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('delivery_line_exceptions').select('*')
      .in('delivery_line_id', deliveryLineIds).order('created_at')
    exceptions = data ?? []
  }

  const coverage = coverageForOrder(sourceLines ?? [], deliveries ?? [], exceptions)
  return {
    order,
    locations: locations ?? [],
    deliveries: deliveries ?? [],
    installations: installations ?? [],
    sourceLines: (sourceLines ?? []).filter(l => l.line_type === 'product'),
    exceptions,
    coverage,
  }
}

function coverageForOrder(
  sourceLines: Array<Record<string, unknown>>,
  deliveries: Array<Record<string, unknown>>,
  exceptions: Array<Record<string, unknown>>,
): LineCoverage[] {
  const orderLines = sourceLines
    .filter(l => l.line_type === 'product')
    .map(l => ({ id: l.id as string, quantity: Number(l.quantity), name: (l.name as string) ?? null } as { id: string; quantity: number; name?: string }))
  const deliveryLines: DeliveryLineQty[] = deliveries.flatMap(d =>
    ((d.lines ?? []) as Array<Record<string, unknown>>).map(l => ({
      delivery_id: d.id as string,
      delivery_line_id: l.id as string,
      source_line_item_id: l.source_line_item_id as string,
      quantity: Number(l.quantity),
      dispatch_status: d.dispatch_status as DispatchStatus,
    })))
  const excQ: LineExceptionQty[] = exceptions.map(e => ({
    delivery_line_id: e.delivery_line_id as string,
    type: e.type as LineExceptionQty['type'],
    quantity_affected: Number(e.quantity_affected),
    resolution_status: e.resolution_status as LineExceptionQty['resolution_status'],
  }))
  return computeDeliveryCoverage(orderLines, deliveryLines, excQ)
}

// ─────────────────────────────────────────────────────────────
// Create / amend deliveries
// ─────────────────────────────────────────────────────────────

export async function createDelivery(params: {
  orderId: string
  deliveryLocationId?: string | null
  originType: OriginType
  originManufacturerId?: string | null
  carrier?: string | null
  expectedDate?: string | null
  instructions?: string | null
  actor: SessionUser
}): Promise<DomainResult<{ id: string; deliveryNumber: string }>> {
  const { data: order } = await supabaseAdmin
    .from('commercial_orders')
    .select('id, status, order_number, source:proformas!commercial_orders_source_proforma_id_fkey(proforma_number)')
    .eq('id', params.orderId).single()
  if (!order) return { error: 'Commercial order not found', status: 404 }
  if (order.status === 'cancelled') return { error: 'This order is cancelled.', status: 409 }
  if (params.originType === 'direct_maker' && !params.originManufacturerId) {
    return { error: 'A direct-from-maker delivery needs the maker set.', status: 400 }
  }
  if (params.deliveryLocationId) {
    const { data: loc } = await supabaseAdmin.from('delivery_locations')
      .select('id, commercial_order_id').eq('id', params.deliveryLocationId).single()
    if (!loc || loc.commercial_order_id !== params.orderId) {
      return { error: 'That delivery location does not belong to this order.', status: 400 }
    }
  }

  const deliveryNumber = await nextDeliveryNumber()
  const { data: del, error } = await supabaseAdmin.from('deliveries').insert({
    delivery_number: deliveryNumber,
    commercial_order_id: params.orderId,
    proforma_reference: (order.source as { proforma_number?: string } | null)?.proforma_number ?? null,
    delivery_location_id: params.deliveryLocationId ?? null,
    origin_type: params.originType,
    origin_manufacturer_id: params.originType === 'direct_maker' ? params.originManufacturerId : null,
    carrier: params.carrier ?? null,
    expected_date: params.expectedDate ?? null,
    instructions: params.instructions ?? null,
    created_by: params.actor.id,
  }).select('id').single()
  if (error || !del) return { error: error?.message ?? 'Could not create the delivery.', status: 500 }

  await logAudit({
    actor: params.actor, action: 'commercial.delivery_created', entityType: 'delivery', entityId: del.id,
    after: { deliveryNumber, orderNumber: order.order_number, originType: params.originType },
  })
  return { data: { id: del.id, deliveryNumber } }
}

/** Add or update a delivery line; enforces remaining-quantity rules. */
export async function assignDeliveryLine(params: {
  deliveryId: string
  sourceLineItemId: string
  quantity: number
  notes?: string | null
  existingLineId?: string | null    // when editing an existing delivery line
  actor: SessionUser
}): Promise<DomainResult<{ lineId: string }>> {
  const { data: del } = await supabaseAdmin.from('deliveries')
    .select('id, commercial_order_id, dispatch_status, locked_at').eq('id', params.deliveryId).single()
  if (!del) return { error: 'Delivery not found', status: 404 }
  if (del.locked_at || !canDispatch(del.dispatch_status as DispatchStatus)) {
    return { error: 'Lines can only be changed before dispatch.', status: 409 }
  }

  // The source line must belong to this order's proforma and be a product line.
  const { data: order } = await supabaseAdmin.from('commercial_orders')
    .select('id, source_proforma_id').eq('id', del.commercial_order_id).single()
  const { data: srcLine } = await supabaseAdmin.from('proforma_line_items')
    .select('id, proforma_id, quantity, line_type').eq('id', params.sourceLineItemId).single()
  if (!order || !srcLine || srcLine.proforma_id !== order.source_proforma_id) {
    return { error: 'That line does not belong to this order.', status: 400 }
  }
  if (srcLine.line_type !== 'product') {
    return { error: 'Only product lines are shipped on deliveries.', status: 400 }
  }

  // Quantity guard: assigned on OTHER active deliveries + other lines of this delivery.
  const { data: siblingDeliveries } = await supabaseAdmin.from('deliveries')
    .select('id, dispatch_status, lines:delivery_lines(id, source_line_item_id, quantity)')
    .eq('commercial_order_id', del.commercial_order_id)
  let alreadyAssigned = 0
  for (const d of siblingDeliveries ?? []) {
    if (!statusCountsAsActive(d.dispatch_status as DispatchStatus)) continue
    for (const l of (d.lines ?? []) as Array<Record<string, unknown>>) {
      if (l.source_line_item_id !== params.sourceLineItemId) continue
      if (params.existingLineId && l.id === params.existingLineId) continue
      alreadyAssigned += Number(l.quantity)
    }
  }
  const err = validateAssignQuantity({
    ordered: Number(srcLine.quantity), alreadyAssigned, quantity: params.quantity,
  })
  if (err) return { error: err, status: 400 }

  if (params.existingLineId) {
    const updates: Record<string, unknown> = { quantity: params.quantity }
    if (params.notes !== undefined) updates.notes = params.notes
    const { error } = await supabaseAdmin.from('delivery_lines')
      .update(updates)
      .eq('id', params.existingLineId).eq('delivery_id', params.deliveryId)
    if (error) return { error: error.message, status: 500 }
    return { data: { lineId: params.existingLineId } }
  }
  const { data: line, error } = await supabaseAdmin.from('delivery_lines').insert({
    delivery_id: params.deliveryId,
    source_line_item_id: params.sourceLineItemId,
    quantity: params.quantity,
    notes: params.notes ?? null,
  }).select('id').single()
  if (error || !line) {
    if (error?.code === '23505') return { error: 'This line is already on the delivery — edit its quantity instead.', status: 409 }
    return { error: error?.message ?? 'Could not add the line.', status: 500 }
  }
  return { data: { lineId: line.id } }
}

/** Manual status transitions (in_transit / failed / returned / preparing). */
export async function transitionDelivery(params: {
  deliveryId: string
  to: DispatchStatus
  actor: SessionUser
}): Promise<DomainResult<{ status: DispatchStatus }>> {
  const { data: del } = await supabaseAdmin.from('deliveries')
    .select('id, delivery_number, dispatch_status').eq('id', params.deliveryId).single()
  if (!del) return { error: 'Delivery not found', status: 404 }
  const from = del.dispatch_status as DispatchStatus
  if (!canTransitionDispatch(from, params.to)) {
    return { error: `A ${from.replace(/_/g, ' ')} delivery cannot move to ${params.to.replace(/_/g, ' ')}.`, status: 409 }
  }
  const { error } = await supabaseAdmin.from('deliveries')
    .update({ dispatch_status: params.to, updated_at: new Date().toISOString() })
    .eq('id', params.deliveryId).eq('dispatch_status', from)
  if (error) return { error: error.message, status: 500 }
  await logAudit({
    actor: params.actor, action: 'commercial.delivery_status_changed', entityType: 'delivery',
    entityId: params.deliveryId, before: { status: from }, after: { status: params.to, deliveryNumber: del.delivery_number },
  })
  return { data: { status: params.to } }
}

// ─────────────────────────────────────────────────────────────
// Delivery-note snapshot (no-price, guarded) + atomic dispatch
// ─────────────────────────────────────────────────────────────

export async function buildDeliveryNoteSnapshot(
  deliveryId: string, actorEmail: string,
): Promise<DomainResult<DeliveryNoteSnapshot>> {
  const { data: del } = await supabaseAdmin
    .from('deliveries')
    .select('*, location:delivery_locations(*, contacts:site_contacts(*)), manufacturer:artisans(id, name, trading_name), order:commercial_orders(id, order_number, client_snapshot, project_snapshot, source_proforma_id)')
    .eq('id', deliveryId).single()
  if (!del) return { error: 'Delivery not found', status: 404 }
  const order = (del.order ?? {}) as Record<string, unknown>
  const location = (del.location ?? null) as Record<string, unknown> | null
  if (!location) return { error: 'Set a delivery location before issuing the delivery note.', status: 409 }

  const { data: lines } = await supabaseAdmin
    .from('delivery_lines')
    .select('*, source_line:proforma_line_items(id, name, description, section, spec_details, selected_finish, selected_fabric, selected_size, image_url, manufacturer_id, quantity, unit_of_measure, manufacturer:artisans(id, name), product:products(images))')
    .eq('delivery_id', deliveryId).order('created_at')
  if (!lines || lines.length === 0) return { error: 'Add at least one line before issuing the delivery note.', status: 409 }

  const { data: packages } = await supabaseAdmin
    .from('delivery_packages').select('*').eq('delivery_id', deliveryId).order('created_at')

  // Related purchase orders per source line (maker copy references them).
  const sourceIds = lines.map(l => (l.source_line as { id?: string } | null)?.id).filter(Boolean) as string[]
  const poBySource = new Map<string, string>()
  if (sourceIds.length > 0) {
    const { data: poLines } = await supabaseAdmin
      .from('purchase_order_lines')
      .select('source_line_item_id, po:purchase_orders(purchase_order_number, status, manufacturer_id)')
      .in('source_line_item_id', sourceIds)
    for (const pl of poLines ?? []) {
      const po = pl.po as { purchase_order_number?: string; status?: string } | null
      if (!po?.purchase_order_number || po.status === 'cancelled') continue
      if (!poBySource.has(pl.source_line_item_id as string)) {
        poBySource.set(pl.source_line_item_id as string, po.purchase_order_number)
      }
    }
  }

  // Installation summary (client copy shows it, spec §3).
  const { data: inst } = await supabaseAdmin
    .from('installations')
    .select('installation_number, status, scheduled_date, installer_name')
    .eq('commercial_order_id', order.id as string)
    .neq('status', 'not_required')
    .order('created_at').limit(1)

  const settings = await getCommercialSettings()
  const client = (order.client_snapshot ?? {}) as Record<string, unknown>
  const project = (order.project_snapshot ?? {}) as Record<string, unknown>
  const contacts = ((location.contacts ?? []) as Array<Record<string, unknown>>)

  const snapshot: DeliveryNoteSnapshot = {
    docType: 'delivery_note',
    deliveryNumber: del.delivery_number,
    orderNumber: (order.order_number as string) ?? null,
    proformaReference: del.proforma_reference ?? null,
    issuedAt: new Date().toISOString(),
    issuedByEmail: actorEmail,
    delivery: {
      origin_type: del.origin_type,
      origin_manufacturer_name: (del.manufacturer as { name?: string } | null)?.name ?? null,
      carrier: del.carrier ?? null,
      expected_date: del.expected_date ?? null,
      dispatched_at: del.dispatched_at ?? null,
      instructions: del.instructions ?? null,
    },
    location: {
      label: (location.label as string) ?? 'Site',
      address_line1: (location.address_line1 as string) ?? null,
      address_line2: (location.address_line2 as string) ?? null,
      city: (location.city as string) ?? null,
      region: (location.region as string) ?? null,
      postcode: (location.postcode as string) ?? null,
      country: (location.country as string) ?? null,
      access_notes: (location.access_notes as string) ?? null,
    },
    contacts: contacts.map(c => ({
      name: (c.name as string) ?? '',
      role: (c.role as string) ?? null,
      phone: (c.phone as string) ?? null,
      email: (c.email as string) ?? null,
      is_primary: Boolean(c.is_primary),
    })),
    client: {
      name: (client.client_name as string) ?? null,
      company: (client.client_company as string) ?? null,
    },
    project: {
      name: (project.project_name as string) ?? null,
      location: (project.project_location as string) ?? null,
    },
    lines: lines.map(l => {
      const src = (l.source_line ?? {}) as Record<string, unknown>
      const manufacturer = (src.manufacturer as { id?: string; name?: string } | null)
      return {
        id: l.id as string,
        source_line_item_id: (src.id as string) ?? (l.source_line_item_id as string),
        name: (src.name as string) ?? '—',
        description: (src.description as string) ?? null,
        section: (src.section as string) ?? null,
        spec_details: (src.spec_details as string) ?? null,
        selected_finish: (src.selected_finish as string) ?? null,
        selected_fabric: (src.selected_fabric as string) ?? null,
        selected_size: (src.selected_size as string) ?? null,
        image_url: (src.image_url as string)
          ?? ((src.product as { images?: string[] } | null)?.images?.[0] ?? null),
        manufacturer_id: (src.manufacturer_id as string) ?? null,
        manufacturer_name: manufacturer?.name ?? null,
        purchase_order_number: poBySource.get((src.id as string) ?? '') ?? null,
        quantity: Number(l.quantity),
        ordered_quantity: Number(src.quantity ?? 0),
        unit_of_measure: (src.unit_of_measure as string) ?? 'each',
        notes: (l.notes as string) ?? null,
      }
    }),
    packages: (packages ?? []).map(p => ({
      reference: (p.reference as string) ?? null,
      description: (p.description as string) ?? null,
      weight: (p.weight as string) ?? null,
      dimensions: (p.dimensions as string) ?? null,
    })),
    installation: inst?.[0] ? {
      installation_number: inst[0].installation_number,
      status: inst[0].status as InstallationStatus,
      scheduled_date: inst[0].scheduled_date ?? null,
      installer_name: inst[0].installer_name ?? null,
    } : null,
    settings: {
      company_legal_name: settings.company_legal_name,
      company_registration_number: settings.company_registration_number,
      registered_address: settings.registered_address,
      contact_email: settings.invoice_email,
      contact_phone: settings.invoice_phone,
    },
  }

  // NO-PRICE GUARD: refuse to produce a snapshot containing money fields.
  const leaks = findForbiddenDeliveryFields(snapshot)
  if (leaks.length > 0) {
    return { error: `Refusing to build delivery note: forbidden fields present: ${leaks.join(', ')}`, status: 500 }
  }
  return { data: snapshot }
}

/** Atomic dispatch: snapshot + status change in one SQL transaction. */
export async function dispatchDelivery(params: {
  deliveryId: string
  actor: SessionUser
}): Promise<DomainResult<{ deliveryNumber: string }>> {
  const snap = await buildDeliveryNoteSnapshot(params.deliveryId, params.actor.email)
  if (isErr(snap)) return snap

  const { data, error } = await supabaseAdmin.rpc('dispatch_delivery', {
    p_delivery_id: params.deliveryId,
    p_snapshot: snap.data as unknown as Record<string, unknown>,
    p_actor: params.actor.id,
  })
  if (error) return { error: `Dispatch failed: ${error.message}`, status: 500 }
  const res = data as { ok: boolean; error?: string; delivery_number?: string }
  if (!res?.ok) {
    const map: Record<string, [string, number]> = {
      not_found: ['Delivery not found.', 404],
      bad_status: ['Only a pending or preparing delivery can be dispatched.', 409],
      no_location: ['Set a delivery location before dispatch.', 409],
      no_lines: ['Add at least one line before dispatch.', 409],
    }
    const [msg, status] = map[res?.error ?? ''] ?? ['Dispatch failed.', 409]
    return { error: msg, status }
  }

  await logAudit({
    actor: params.actor, action: 'commercial.delivery_dispatched', entityType: 'delivery',
    entityId: params.deliveryId, after: { deliveryNumber: res.delivery_number },
  })
  await refreshOrderDeliveryStatus(params.deliveryId)
  return { data: { deliveryNumber: res.delivery_number ?? '' } }
}

/** Keep the commercial order's headline status in step with shipments. */
async function refreshOrderDeliveryStatus(deliveryId: string): Promise<void> {
  const { data: del } = await supabaseAdmin.from('deliveries')
    .select('commercial_order_id').eq('id', deliveryId).single()
  if (!del) return
  const state = await orderDeliveryState(del.commercial_order_id)
  if (!state) return
  const cov = state.coverage
  if (cov.length === 0) return
  const anyShipped = cov.some(c => c.shipped > 0)
  const allDone = cov.every(c => c.shipped >= c.ordered && c.backorderQty === 0)
  const current = state.order.status as string
  // Upgrade-only; terminal/manual states are never overwritten.
  const upgradable = ['accepted', 'procurement_ready', 'partially_ordered', 'fully_ordered', 'in_progress']
  if (anyShipped && !allDone && upgradable.includes(current)) {
    await supabaseAdmin.from('commercial_orders')
      .update({ status: 'partially_delivered', updated_at: new Date().toISOString() })
      .eq('id', del.commercial_order_id)
  }
}

// ─────────────────────────────────────────────────────────────
// Confirmation tokens (Sprint 3 acceptance pattern)
// ─────────────────────────────────────────────────────────────

/** Mint a delivery-confirmation link; revokes any previous active token. */
export async function createDeliveryConfirmationToken(params: {
  deliveryId: string; actor: SessionUser
}): Promise<DomainResult<{ token: string; url: string; expiresAt: string }>> {
  const { data: del } = await supabaseAdmin.from('deliveries')
    .select('id, delivery_number, dispatch_status, locked_at').eq('id', params.deliveryId).single()
  if (!del) return { error: 'Delivery not found', status: 404 }
  if (!del.locked_at) return { error: 'Issue the delivery note (dispatch) before creating a confirmation link.', status: 409 }
  if (!canRecordPod(del.dispatch_status as DispatchStatus)) {
    return { error: 'This delivery is not awaiting confirmation.', status: 409 }
  }

  await supabaseAdmin.from('delivery_confirmation_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('delivery_id', params.deliveryId).is('revoked_at', null).is('used_at', null)

  const settings = await getCommercialSettings()
  const expiryDays = Number(settings.delivery_confirmation_expiry_days ?? 30)
  const raw = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + expiryDays * 86400000).toISOString()

  const { error } = await supabaseAdmin.from('delivery_confirmation_tokens').insert({
    delivery_id: params.deliveryId, token_hash: hashToken(raw),
    expires_at: expiresAt, created_by: params.actor.id,
  })
  if (error) return { error: 'Could not create the confirmation link.', status: 500 }

  await logAudit({
    actor: params.actor, action: 'commercial.delivery_confirmation_link_created', entityType: 'delivery',
    entityId: params.deliveryId, after: { deliveryNumber: del.delivery_number, expiresAt },
  })
  return { data: { token: raw, url: `/delivery/confirm/${raw}`, expiresAt } }
}

/** Public token resolution for the site confirmation page. */
export async function resolveDeliveryConfirmationToken(raw: string): Promise<
  DomainResult<{ token: Record<string, unknown>; delivery: Record<string, unknown>; snapshot: DeliveryNoteSnapshot }>
> {
  if (!raw || raw.length < 20 || raw.length > 100 || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    return { error: 'Invalid link.', status: 400 }
  }
  const { data: tok } = await supabaseAdmin
    .from('delivery_confirmation_tokens').select('*').eq('token_hash', hashToken(raw)).single()
  if (!tok) return { error: 'This link is not valid.', status: 404 }
  if (tok.revoked_at) return { error: 'This link has been superseded. Please use the most recent link you were given.', status: 410 }
  if (new Date(tok.expires_at) < new Date()) return { error: 'This link has expired. Please contact Full Bloom Artelier for a new one.', status: 410 }

  const { data: del } = await supabaseAdmin.from('deliveries')
    .select('*, lines:delivery_lines(id, quantity, notes)').eq('id', tok.delivery_id).single()
  if (!del) return { error: 'Delivery unavailable.', status: 404 }

  const { data: snapRow } = await supabaseAdmin
    .from('delivery_note_snapshots').select('snapshot').eq('delivery_id', tok.delivery_id).single()
  if (!snapRow) return { error: 'Delivery documentation unavailable.', status: 404 }

  if (!tok.first_viewed_at) {
    await supabaseAdmin.from('delivery_confirmation_tokens')
      .update({ first_viewed_at: new Date().toISOString() }).eq('id', tok.id)
    await logAudit({
      actor: null, action: 'commercial.delivery_confirmation_viewed', entityType: 'delivery',
      entityId: tok.delivery_id as string, after: { deliveryNumber: del.delivery_number },
    })
  }
  return { data: { token: tok, delivery: del, snapshot: snapRow.snapshot as unknown as DeliveryNoteSnapshot } }
}

// ─────────────────────────────────────────────────────────────
// Proof of delivery (atomic; both channels)
// ─────────────────────────────────────────────────────────────

export interface PodExceptionInput {
  deliveryLineId: string
  type: 'shortage' | 'damage' | 'wrong_item'
  quantityAffected: number
  notes?: string | null
}

export async function recordPod(params: {
  channel: { kind: 'site_link'; raw: string } | { kind: 'admin'; deliveryId: string; actor: SessionUser }
  receivedByName: string
  conditionNotes?: string | null
  signatureUrl?: string | null
  photoUrls?: Array<{ url: string; caption?: string | null }>
  exceptions?: PodExceptionInput[]
  ipHash?: string | null
}): Promise<DomainResult<{ podId: string; status: DispatchStatus; deliveryId: string }>> {
  const isLink = params.channel.kind === 'site_link'
  const { data, error } = await supabaseAdmin.rpc('record_delivery_pod', {
    p_delivery_id: isLink ? null : (params.channel as { deliveryId: string }).deliveryId,
    p_token_hash: isLink ? hashToken((params.channel as { raw: string }).raw) : null,
    p_method: isLink ? 'site_link' : 'admin',
    p_received_by: params.receivedByName,
    p_condition_notes: params.conditionNotes ?? null,
    p_signature_url: params.signatureUrl ?? null,
    p_photos: (params.photoUrls ?? []).map(p => ({ url: p.url, caption: p.caption ?? null })),
    p_exceptions: (params.exceptions ?? []).map(e => ({
      delivery_line_id: e.deliveryLineId, type: e.type,
      quantity_affected: e.quantityAffected, notes: e.notes ?? null,
    })),
    p_ip_hash: params.ipHash ?? null,
    p_actor: isLink ? null : (params.channel as { actor: SessionUser }).actor.id,
  })
  if (error) return { error: `Could not record the delivery confirmation: ${error.message}`, status: 500 }
  const res = data as { ok: boolean; error?: string; pod_id?: string; status?: string; delivery_id?: string }
  if (!res?.ok) {
    const map: Record<string, [string, number]> = {
      not_found: ['This link is not valid.', 404],
      revoked: ['This link has been superseded.', 410],
      used: ['This delivery has already been confirmed.', 409],
      expired: ['This link has expired.', 410],
      bad_status: ['This delivery is not awaiting confirmation.', 409],
    }
    const [msg, status] = map[res?.error ?? ''] ?? ['Could not record the delivery confirmation.', 409]
    return { error: msg, status }
  }

  await logAudit({
    actor: isLink ? null : (params.channel as { actor: SessionUser }).actor,
    action: 'commercial.delivery_pod_recorded', entityType: 'delivery',
    entityId: res.delivery_id ?? null,
    after: {
      method: isLink ? 'site_link' : 'admin', receivedBy: params.receivedByName,
      status: res.status, exceptions: (params.exceptions ?? []).length,
    },
  })
  if (res.delivery_id) await refreshOrderDeliveryStatus(res.delivery_id)
  return {
    data: {
      podId: res.pod_id ?? '', status: (res.status ?? 'delivered') as DispatchStatus,
      deliveryId: res.delivery_id ?? '',
    },
  }
}

/** Upload a POD image (signature or photo) to the private bucket. */
export async function uploadPodImage(params: {
  deliveryId: string
  kind: 'signature' | 'photo'
  data: Buffer
  contentType: string
}): Promise<DomainResult<{ path: string }>> {
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(params.contentType)) return { error: 'Only JPEG, PNG or WebP images are accepted.', status: 400 }
  if (params.data.length > 5 * 1024 * 1024) return { error: 'Images must be 5 MB or smaller.', status: 400 }
  const ext = params.contentType === 'image/png' ? 'png' : params.contentType === 'image/webp' ? 'webp' : 'jpg'
  const path = `${params.deliveryId}/${params.kind}-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`
  const { error } = await supabaseAdmin.storage.from(POD_BUCKET)
    .upload(path, params.data, { contentType: params.contentType, upsert: false })
  if (error) return { error: `Upload failed: ${error.message}`, status: 500 }
  return { data: { path } }
}

/** Short-lived signed URL for viewing a private POD asset (admin UI). */
export async function podSignedUrl(path: string, expiresInSeconds = 600): Promise<string | null> {
  const { data } = await supabaseAdmin.storage.from(POD_BUCKET).createSignedUrl(path, expiresInSeconds)
  return data?.signedUrl ?? null
}

// ─────────────────────────────────────────────────────────────
// Installations
// ─────────────────────────────────────────────────────────────

export async function createInstallation(params: {
  orderId: string
  scheduledDate?: string | null
  installerName?: string | null
  installerContact?: string | null
  accessNotes?: string | null
  linkedDeliveryId?: string | null
  actor: SessionUser
}): Promise<DomainResult<{ id: string; installationNumber: string }>> {
  const { data: order } = await supabaseAdmin.from('commercial_orders')
    .select('id, status, order_number').eq('id', params.orderId).single()
  if (!order) return { error: 'Commercial order not found', status: 404 }
  if (order.status === 'cancelled') return { error: 'This order is cancelled.', status: 409 }
  if (params.linkedDeliveryId) {
    const { data: del } = await supabaseAdmin.from('deliveries')
      .select('id, commercial_order_id').eq('id', params.linkedDeliveryId).single()
    if (!del || del.commercial_order_id !== params.orderId) {
      return { error: 'That delivery does not belong to this order.', status: 400 }
    }
  }
  const installationNumber = await nextInstallationNumber()
  const { data: inst, error } = await supabaseAdmin.from('installations').insert({
    installation_number: installationNumber,
    commercial_order_id: params.orderId,
    status: params.scheduledDate ? 'scheduled' : 'to_schedule',
    scheduled_date: params.scheduledDate ?? null,
    installer_name: params.installerName ?? null,
    installer_contact: params.installerContact ?? null,
    access_notes: params.accessNotes ?? null,
    linked_delivery_id: params.linkedDeliveryId ?? null,
    created_by: params.actor.id,
  }).select('id').single()
  if (error || !inst) return { error: error?.message ?? 'Could not create the installation.', status: 500 }
  await logAudit({
    actor: params.actor, action: 'commercial.installation_created', entityType: 'installation',
    entityId: inst.id, after: { installationNumber, orderNumber: order.order_number },
  })
  return { data: { id: inst.id, installationNumber } }
}

export async function transitionInstallation(params: {
  installationId: string
  to: InstallationStatus
  signedOffBy?: string | null
  completionNotes?: string | null
  actor: SessionUser
}): Promise<DomainResult<{ status: InstallationStatus }>> {
  const { data: inst } = await supabaseAdmin.from('installations')
    .select('id, installation_number, status').eq('id', params.installationId).single()
  if (!inst) return { error: 'Installation not found', status: 404 }
  const from = inst.status as InstallationStatus
  if (!canTransitionInstallation(from, params.to)) {
    return { error: `A ${from.replace(/_/g, ' ')} installation cannot move to ${params.to.replace(/_/g, ' ')}.`, status: 409 }
  }
  if (params.to === 'completed' && !params.signedOffBy) {
    return { error: 'Completion requires a sign-off name.', status: 400 }
  }
  const updates: Record<string, unknown> = {
    status: params.to, updated_at: new Date().toISOString(),
  }
  if (params.to === 'completed') {
    updates.signed_off_by = params.signedOffBy
    updates.signed_off_at = new Date().toISOString()
    if (params.completionNotes !== undefined) updates.completion_notes = params.completionNotes
  }
  const { error } = await supabaseAdmin.from('installations')
    .update(updates).eq('id', params.installationId).eq('status', from)
  if (error) return { error: error.message, status: 500 }
  await logAudit({
    actor: params.actor, action: 'commercial.installation_status_changed', entityType: 'installation',
    entityId: params.installationId, before: { status: from },
    after: { status: params.to, installationNumber: inst.installation_number },
  })
  return { data: { status: params.to } }
}
