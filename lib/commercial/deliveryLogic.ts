// ============================================================
// Delivery domain — PURE logic (Sprint 4).
//
// No imports from server-only modules: this file is shared by
// API routes, the renderer, and the unit tests (see
// tsconfig.test.json). It contains:
//   • dispatch/installation status state machines
//   • partial-delivery coverage + automatic backorder flagging
//   • the no-price deep-scan guard for delivery documents
//   • the delivery-note snapshot shape
// ============================================================

// ── Enums (DB check constraints + API validation share these) ──

export type OriginType = 'consolidated' | 'direct_maker'
export type DispatchStatus =
  | 'pending' | 'preparing' | 'dispatched' | 'in_transit'
  | 'delivered' | 'partially_delivered' | 'failed' | 'returned'
export type InstallationStatus =
  | 'not_required' | 'to_schedule' | 'scheduled' | 'in_progress' | 'completed' | 'snagging'
export type DeliveryExceptionType = 'shortage' | 'damage' | 'wrong_item'
export type ExceptionResolutionStatus = 'open' | 'reordering' | 'credited' | 'resolved'
export type PodMethod = 'site_link' | 'admin'
export type DeliveryNoteAudience = 'client' | 'site' | 'manufacturer'

export const ORIGIN_TYPES: OriginType[] = ['consolidated', 'direct_maker']
export const DISPATCH_STATUSES: DispatchStatus[] = [
  'pending', 'preparing', 'dispatched', 'in_transit',
  'delivered', 'partially_delivered', 'failed', 'returned',
]
export const INSTALLATION_STATUSES: InstallationStatus[] = [
  'not_required', 'to_schedule', 'scheduled', 'in_progress', 'completed', 'snagging',
]
export const DELIVERY_EXCEPTION_TYPES: DeliveryExceptionType[] = ['shortage', 'damage', 'wrong_item']
export const EXCEPTION_RESOLUTION_STATUSES: ExceptionResolutionStatus[] = ['open', 'reordering', 'credited', 'resolved']
export const DELIVERY_NOTE_AUDIENCES: DeliveryNoteAudience[] = ['client', 'site', 'manufacturer']

// ── Dispatch state machine ─────────────────────────────────
//
// 'dispatched' is reachable ONLY via the atomic dispatch_delivery
// SQL function; 'delivered'/'partially_delivered' ONLY via the
// atomic record_delivery_pod function. The manual map is what the
// PATCH endpoint may do directly.

const MANUAL_DISPATCH_TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  pending: ['preparing'],
  preparing: ['pending'],
  dispatched: ['in_transit', 'failed'],
  in_transit: ['failed'],
  delivered: ['returned'],
  partially_delivered: ['returned'],
  failed: ['preparing'],
  returned: [],
}

export function canTransitionDispatch(from: DispatchStatus, to: DispatchStatus): boolean {
  return (MANUAL_DISPATCH_TRANSITIONS[from] ?? []).includes(to)
}

/** Statuses from which the atomic dispatch function may fire. */
export function canDispatch(from: DispatchStatus): boolean {
  return from === 'pending' || from === 'preparing'
}

/** Statuses from which a proof of delivery may be recorded. */
export function canRecordPod(from: DispatchStatus): boolean {
  return from === 'dispatched' || from === 'in_transit' || from === 'partially_delivered'
}

/** A delivery in one of these states counts towards shipped quantity. */
export function statusCountsAsShipped(s: DispatchStatus): boolean {
  return s === 'dispatched' || s === 'in_transit' || s === 'delivered' || s === 'partially_delivered'
}

/** A delivery in one of these states holds its line assignments (not void). */
export function statusCountsAsActive(s: DispatchStatus): boolean {
  return s !== 'failed' && s !== 'returned'
}

// ── Installation state machine ─────────────────────────────

const INSTALLATION_TRANSITIONS: Record<InstallationStatus, InstallationStatus[]> = {
  not_required: ['to_schedule'],
  to_schedule: ['not_required', 'scheduled'],
  scheduled: ['to_schedule', 'in_progress'],
  in_progress: ['completed', 'snagging'],
  snagging: ['completed', 'in_progress'],
  completed: ['snagging'],   // re-open only into snagging (defects after sign-off)
}

export function canTransitionInstallation(from: InstallationStatus, to: InstallationStatus): boolean {
  return (INSTALLATION_TRANSITIONS[from] ?? []).includes(to)
}

// ── Partial delivery coverage + backorder auto-flagging ────

export interface OrderLineQty {
  id: string                       // proforma_line_items.id (source line)
  quantity: number                 // total ordered quantity
  name?: string
}
export interface DeliveryLineQty {
  delivery_id: string
  source_line_item_id: string
  quantity: number
  dispatch_status: DispatchStatus  // of the parent delivery
  delivery_line_id?: string
}
export interface LineExceptionQty {
  delivery_line_id: string
  type: DeliveryExceptionType
  quantity_affected: number
  resolution_status?: ExceptionResolutionStatus
}

export interface LineCoverage {
  sourceLineItemId: string
  name: string | null
  ordered: number
  /** Quantity assigned to any active (non-failed / non-returned) delivery. */
  assigned: number
  /** Quantity on deliveries that have actually gone out the door. */
  shipped: number
  /** Quantity flagged short on delivery (open shortage exceptions). */
  shortfall: number
  /** Ordered minus assigned — still needs a delivery created. */
  remainingToAssign: number
  /**
   * AUTO-FLAG (spec §9.4): the un-shipped remainder of a part-shipped
   * line, plus any open shortages, is a backorder to schedule.
   */
  backorderQty: number
  backorder: boolean
}

export function computeDeliveryCoverage(
  orderLines: OrderLineQty[],
  deliveryLines: DeliveryLineQty[],
  exceptions: LineExceptionQty[] = [],
): LineCoverage[] {
  // Open shortages by delivery_line_id (resolved/credited shortages no longer count).
  const shortageByDeliveryLine = new Map<string, number>()
  for (const e of exceptions) {
    if (e.type !== 'shortage') continue
    if (e.resolution_status && e.resolution_status !== 'open' && e.resolution_status !== 'reordering') continue
    shortageByDeliveryLine.set(
      e.delivery_line_id,
      (shortageByDeliveryLine.get(e.delivery_line_id) ?? 0) + Number(e.quantity_affected || 0),
    )
  }

  return orderLines.map(ol => {
    let assigned = 0
    let shipped = 0
    let shortfall = 0
    for (const dl of deliveryLines) {
      if (dl.source_line_item_id !== ol.id) continue
      const q = Number(dl.quantity || 0)
      if (statusCountsAsActive(dl.dispatch_status)) assigned += q
      if (statusCountsAsShipped(dl.dispatch_status)) shipped += q
      if (dl.delivery_line_id && shortageByDeliveryLine.has(dl.delivery_line_id)) {
        shortfall += Math.min(shortageByDeliveryLine.get(dl.delivery_line_id)!, q)
      }
    }
    const ordered = Number(ol.quantity || 0)
    const remainingToAssign = Math.max(0, round3(ordered - assigned))
    // Backorder = remainder of a line that has PART-shipped, plus open shortages.
    const partShippedRemainder = shipped > 0 ? remainingToAssign : 0
    const backorderQty = round3(partShippedRemainder + shortfall)
    return {
      sourceLineItemId: ol.id,
      name: ol.name ?? null,
      ordered,
      assigned: round3(assigned),
      shipped: round3(shipped),
      shortfall: round3(shortfall),
      remainingToAssign,
      backorderQty,
      backorder: backorderQty > 0,
    }
  })
}

function round3(n: number): number { return Math.round(n * 1000) / 1000 }

/**
 * Validate a quantity being assigned to a delivery for a source line.
 * Returns an error message, or null when valid.
 */
export function validateAssignQuantity(params: {
  ordered: number
  alreadyAssigned: number   // on other active deliveries (excluding the line being edited)
  quantity: number
}): string | null {
  const { ordered, alreadyAssigned, quantity } = params
  if (!Number.isFinite(quantity) || quantity <= 0) return 'Quantity must be greater than zero.'
  const remaining = round3(ordered - alreadyAssigned)
  if (quantity > remaining + 1e-9) {
    return `Only ${remaining} of ${ordered} remain unassigned for this line.`
  }
  return null
}

// ── No-price guard (spec §5) ───────────────────────────────
//
// Delivery documents are no-price BY DESIGN. This deep-scans any
// object about to be snapshotted or rendered and reports every
// key that looks like money. Renderers refuse to render when a
// hit is found (mirrors findForbiddenClientInvoiceFields /
// findForbiddenSupplierFields).

const FORBIDDEN_KEY_RE = /price|cost(?!ume)|margin|markup|subtotal|vat|tax|deposit|discount|balance|amount_|_amount|grand_total|gross|net_total|line_total|payment|bank|invoice_total|fee(?:s)?$|procurement_fee/i

/** Keys that would match the regex but are legitimately price-free. */
const ALLOWED_KEYS = new Set([
  'quantity_affected',
])

export function findForbiddenDeliveryFields(obj: unknown, path = ''): string[] {
  const hits: string[] = []
  if (obj === null || typeof obj !== 'object') return hits
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => hits.push(...findForbiddenDeliveryFields(item, `${path}[${i}]`)))
    return hits
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k
    if (!ALLOWED_KEYS.has(k) && FORBIDDEN_KEY_RE.test(k)) hits.push(p)
    if (v && typeof v === 'object') hits.push(...findForbiddenDeliveryFields(v, p))
  }
  return hits
}

// ── Delivery-note snapshot shape (frozen at dispatch) ──────

export interface DeliveryNoteLine {
  id: string                      // delivery_lines.id
  source_line_item_id: string
  name: string
  description: string | null
  section: string | null
  spec_details: string | null
  selected_finish: string | null
  selected_fabric: string | null
  selected_size: string | null
  image_url: string | null
  manufacturer_id: string | null
  manufacturer_name: string | null
  purchase_order_number: string | null   // maker copy references the related PO
  quantity: number                       // THIS shipment
  ordered_quantity: number               // order total for context ("2 of 6")
  unit_of_measure: string
  notes: string | null
}

export interface DeliveryNoteSnapshot {
  docType: 'delivery_note'
  deliveryNumber: string
  orderNumber: string | null
  proformaReference: string | null
  issuedAt: string
  issuedByEmail: string
  delivery: {
    origin_type: OriginType
    origin_manufacturer_name: string | null
    carrier: string | null
    expected_date: string | null
    dispatched_at: string | null
    instructions: string | null
  }
  location: {
    label: string
    address_line1: string | null
    address_line2: string | null
    city: string | null
    region: string | null
    postcode: string | null
    country: string | null
    access_notes: string | null
  }
  contacts: Array<{
    name: string
    role: string | null
    phone: string | null
    email: string | null
    is_primary: boolean
  }>
  client: { name: string | null; company: string | null }
  project: { name: string | null; location: string | null }
  lines: DeliveryNoteLine[]
  packages: Array<{
    reference: string | null
    description: string | null
    weight: string | null
    dimensions: string | null
  }>
  installation: {
    installation_number: string
    status: InstallationStatus
    scheduled_date: string | null
    installer_name: string | null
  } | null
  settings: {
    company_legal_name: string
    company_registration_number: string | null
    registered_address: string | null
    contact_email: string
    contact_phone: string | null
  }
}
