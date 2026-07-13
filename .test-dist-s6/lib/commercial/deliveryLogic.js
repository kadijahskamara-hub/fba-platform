"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DELIVERY_NOTE_AUDIENCES = exports.EXCEPTION_RESOLUTION_STATUSES = exports.DELIVERY_EXCEPTION_TYPES = exports.INSTALLATION_STATUSES = exports.DISPATCH_STATUSES = exports.ORIGIN_TYPES = void 0;
exports.canTransitionDispatch = canTransitionDispatch;
exports.canDispatch = canDispatch;
exports.canRecordPod = canRecordPod;
exports.statusCountsAsShipped = statusCountsAsShipped;
exports.statusCountsAsActive = statusCountsAsActive;
exports.canTransitionInstallation = canTransitionInstallation;
exports.computeDeliveryCoverage = computeDeliveryCoverage;
exports.validateAssignQuantity = validateAssignQuantity;
exports.findForbiddenDeliveryFields = findForbiddenDeliveryFields;
exports.ORIGIN_TYPES = ['consolidated', 'direct_maker'];
exports.DISPATCH_STATUSES = [
    'pending', 'preparing', 'dispatched', 'in_transit',
    'delivered', 'partially_delivered', 'failed', 'returned',
];
exports.INSTALLATION_STATUSES = [
    'not_required', 'to_schedule', 'scheduled', 'in_progress', 'completed', 'snagging',
];
exports.DELIVERY_EXCEPTION_TYPES = ['shortage', 'damage', 'wrong_item'];
exports.EXCEPTION_RESOLUTION_STATUSES = ['open', 'reordering', 'credited', 'resolved'];
exports.DELIVERY_NOTE_AUDIENCES = ['client', 'site', 'manufacturer'];
// ── Dispatch state machine ─────────────────────────────────
//
// 'dispatched' is reachable ONLY via the atomic dispatch_delivery
// SQL function; 'delivered'/'partially_delivered' ONLY via the
// atomic record_delivery_pod function. The manual map is what the
// PATCH endpoint may do directly.
const MANUAL_DISPATCH_TRANSITIONS = {
    pending: ['preparing'],
    preparing: ['pending'],
    dispatched: ['in_transit', 'failed'],
    in_transit: ['failed'],
    delivered: ['returned'],
    partially_delivered: ['returned'],
    failed: ['preparing'],
    returned: [],
};
function canTransitionDispatch(from, to) {
    return (MANUAL_DISPATCH_TRANSITIONS[from] ?? []).includes(to);
}
/** Statuses from which the atomic dispatch function may fire. */
function canDispatch(from) {
    return from === 'pending' || from === 'preparing';
}
/** Statuses from which a proof of delivery may be recorded. */
function canRecordPod(from) {
    return from === 'dispatched' || from === 'in_transit' || from === 'partially_delivered';
}
/** A delivery in one of these states counts towards shipped quantity. */
function statusCountsAsShipped(s) {
    return s === 'dispatched' || s === 'in_transit' || s === 'delivered' || s === 'partially_delivered';
}
/** A delivery in one of these states holds its line assignments (not void). */
function statusCountsAsActive(s) {
    return s !== 'failed' && s !== 'returned';
}
// ── Installation state machine ─────────────────────────────
const INSTALLATION_TRANSITIONS = {
    not_required: ['to_schedule'],
    to_schedule: ['not_required', 'scheduled'],
    scheduled: ['to_schedule', 'in_progress'],
    in_progress: ['completed', 'snagging'],
    snagging: ['completed', 'in_progress'],
    completed: ['snagging'], // re-open only into snagging (defects after sign-off)
};
function canTransitionInstallation(from, to) {
    return (INSTALLATION_TRANSITIONS[from] ?? []).includes(to);
}
function computeDeliveryCoverage(orderLines, deliveryLines, exceptions = []) {
    // Open shortages by delivery_line_id (resolved/credited shortages no longer count).
    const shortageByDeliveryLine = new Map();
    for (const e of exceptions) {
        if (e.type !== 'shortage')
            continue;
        if (e.resolution_status && e.resolution_status !== 'open' && e.resolution_status !== 'reordering')
            continue;
        shortageByDeliveryLine.set(e.delivery_line_id, (shortageByDeliveryLine.get(e.delivery_line_id) ?? 0) + Number(e.quantity_affected || 0));
    }
    return orderLines.map(ol => {
        let assigned = 0;
        let shipped = 0;
        let shortfall = 0;
        for (const dl of deliveryLines) {
            if (dl.source_line_item_id !== ol.id)
                continue;
            const q = Number(dl.quantity || 0);
            if (statusCountsAsActive(dl.dispatch_status))
                assigned += q;
            if (statusCountsAsShipped(dl.dispatch_status))
                shipped += q;
            if (dl.delivery_line_id && shortageByDeliveryLine.has(dl.delivery_line_id)) {
                shortfall += Math.min(shortageByDeliveryLine.get(dl.delivery_line_id), q);
            }
        }
        const ordered = Number(ol.quantity || 0);
        const remainingToAssign = Math.max(0, round3(ordered - assigned));
        // Backorder = remainder of a line that has PART-shipped, plus open shortages.
        const partShippedRemainder = shipped > 0 ? remainingToAssign : 0;
        const backorderQty = round3(partShippedRemainder + shortfall);
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
        };
    });
}
function round3(n) { return Math.round(n * 1000) / 1000; }
/**
 * Validate a quantity being assigned to a delivery for a source line.
 * Returns an error message, or null when valid.
 */
function validateAssignQuantity(params) {
    const { ordered, alreadyAssigned, quantity } = params;
    if (!Number.isFinite(quantity) || quantity <= 0)
        return 'Quantity must be greater than zero.';
    const remaining = round3(ordered - alreadyAssigned);
    if (quantity > remaining + 1e-9) {
        return `Only ${remaining} of ${ordered} remain unassigned for this line.`;
    }
    return null;
}
// ── No-price guard (spec §5) ───────────────────────────────
//
// Delivery documents are no-price BY DESIGN. This deep-scans any
// object about to be snapshotted or rendered and reports every
// key that looks like money. Renderers refuse to render when a
// hit is found (mirrors findForbiddenClientInvoiceFields /
// findForbiddenSupplierFields).
const FORBIDDEN_KEY_RE = /price|cost(?!ume)|margin|markup|subtotal|vat|tax|deposit|discount|balance|amount_|_amount|grand_total|gross|net_total|line_total|payment|bank|invoice_total|fee(?:s)?$|procurement_fee/i;
/** Keys that would match the regex but are legitimately price-free. */
const ALLOWED_KEYS = new Set([
    'quantity_affected',
]);
function findForbiddenDeliveryFields(obj, path = '') {
    const hits = [];
    if (obj === null || typeof obj !== 'object')
        return hits;
    if (Array.isArray(obj)) {
        obj.forEach((item, i) => hits.push(...findForbiddenDeliveryFields(item, `${path}[${i}]`)));
        return hits;
    }
    for (const [k, v] of Object.entries(obj)) {
        const p = path ? `${path}.${k}` : k;
        if (!ALLOWED_KEYS.has(k) && FORBIDDEN_KEY_RE.test(k))
            hits.push(p);
        if (v && typeof v === 'object')
            hits.push(...findForbiddenDeliveryFields(v, p));
    }
    return hits;
}
