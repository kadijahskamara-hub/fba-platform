"use strict";
// ============================================================
// Delivery domain logic tests (Sprint 4).
// Node built-in test runner: npm test
// Covers: dispatch/installation state machines, partial-delivery
// coverage + backorder auto-flagging, quantity validation, and
// the no-price deep-scan guard.
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const deliveryLogic_1 = require("../lib/commercial/deliveryLogic");
// ── Dispatch state machine ──────────────────────────────────
(0, node_test_1.test)('dispatch is only reachable from pending/preparing (atomic fn gate)', () => {
    strict_1.default.equal((0, deliveryLogic_1.canDispatch)('pending'), true);
    strict_1.default.equal((0, deliveryLogic_1.canDispatch)('preparing'), true);
    for (const s of deliveryLogic_1.DISPATCH_STATUSES.filter(x => x !== 'pending' && x !== 'preparing')) {
        strict_1.default.equal((0, deliveryLogic_1.canDispatch)(s), false, `canDispatch(${s})`);
    }
});
(0, node_test_1.test)('POD is only recordable once the goods have gone out', () => {
    strict_1.default.equal((0, deliveryLogic_1.canRecordPod)('dispatched'), true);
    strict_1.default.equal((0, deliveryLogic_1.canRecordPod)('in_transit'), true);
    strict_1.default.equal((0, deliveryLogic_1.canRecordPod)('partially_delivered'), true);
    strict_1.default.equal((0, deliveryLogic_1.canRecordPod)('pending'), false);
    strict_1.default.equal((0, deliveryLogic_1.canRecordPod)('delivered'), false);
    strict_1.default.equal((0, deliveryLogic_1.canRecordPod)('returned'), false);
});
(0, node_test_1.test)('manual transitions: valid moves allowed, shortcuts refused', () => {
    // Allowed manual moves
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('pending', 'preparing'), true);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('preparing', 'pending'), true);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('dispatched', 'in_transit'), true);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('dispatched', 'failed'), true);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('in_transit', 'failed'), true);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('failed', 'preparing'), true);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('delivered', 'returned'), true);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('partially_delivered', 'returned'), true);
    // Refused: manual dispatch / delivery (must go through atomic SQL fns)
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('pending', 'dispatched'), false);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('preparing', 'dispatched'), false);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('dispatched', 'delivered'), false);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('in_transit', 'delivered'), false);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('in_transit', 'partially_delivered'), false);
    // Refused: nonsense moves
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('pending', 'in_transit'), false);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('delivered', 'pending'), false);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionDispatch)('returned', 'preparing'), false);
});
(0, node_test_1.test)('shipped/active status classification', () => {
    strict_1.default.equal((0, deliveryLogic_1.statusCountsAsShipped)('dispatched'), true);
    strict_1.default.equal((0, deliveryLogic_1.statusCountsAsShipped)('in_transit'), true);
    strict_1.default.equal((0, deliveryLogic_1.statusCountsAsShipped)('delivered'), true);
    strict_1.default.equal((0, deliveryLogic_1.statusCountsAsShipped)('partially_delivered'), true);
    strict_1.default.equal((0, deliveryLogic_1.statusCountsAsShipped)('pending'), false);
    strict_1.default.equal((0, deliveryLogic_1.statusCountsAsShipped)('failed'), false);
    strict_1.default.equal((0, deliveryLogic_1.statusCountsAsActive)('failed'), false);
    strict_1.default.equal((0, deliveryLogic_1.statusCountsAsActive)('returned'), false);
    strict_1.default.equal((0, deliveryLogic_1.statusCountsAsActive)('pending'), true);
});
// ── Installation state machine ──────────────────────────────
(0, node_test_1.test)('installation lifecycle transitions', () => {
    strict_1.default.equal((0, deliveryLogic_1.canTransitionInstallation)('to_schedule', 'scheduled'), true);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionInstallation)('scheduled', 'in_progress'), true);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionInstallation)('in_progress', 'completed'), true);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionInstallation)('in_progress', 'snagging'), true);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionInstallation)('snagging', 'completed'), true);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionInstallation)('completed', 'snagging'), true); // defects after sign-off
    strict_1.default.equal((0, deliveryLogic_1.canTransitionInstallation)('to_schedule', 'not_required'), true);
    // Refused
    strict_1.default.equal((0, deliveryLogic_1.canTransitionInstallation)('to_schedule', 'completed'), false);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionInstallation)('completed', 'to_schedule'), false);
    strict_1.default.equal((0, deliveryLogic_1.canTransitionInstallation)('not_required', 'in_progress'), false);
    for (const s of deliveryLogic_1.INSTALLATION_STATUSES) {
        strict_1.default.equal((0, deliveryLogic_1.canTransitionInstallation)(s, s), false, `self-transition ${s}`);
    }
});
// ── Coverage + backorder auto-flag ──────────────────────────
const ORDER_LINES = [
    { id: 'L1', quantity: 6, name: 'Dining chair' },
    { id: 'L2', quantity: 1, name: 'Console table' },
];
function dl(source, qty, status, lineId = `${source}-${status}-${qty}`) {
    return { delivery_id: `D-${status}`, delivery_line_id: lineId, source_line_item_id: source, quantity: qty, dispatch_status: status };
}
(0, node_test_1.test)('no deliveries: everything remains to assign, no backorder', () => {
    const cov = (0, deliveryLogic_1.computeDeliveryCoverage)(ORDER_LINES, []);
    strict_1.default.equal(cov[0].remainingToAssign, 6);
    strict_1.default.equal(cov[0].backorder, false);
    strict_1.default.equal(cov[1].remainingToAssign, 1);
});
(0, node_test_1.test)('assigned to a pending delivery: not shipped, no backorder yet', () => {
    const cov = (0, deliveryLogic_1.computeDeliveryCoverage)(ORDER_LINES, [dl('L1', 4, 'pending')]);
    strict_1.default.equal(cov[0].assigned, 4);
    strict_1.default.equal(cov[0].shipped, 0);
    strict_1.default.equal(cov[0].remainingToAssign, 2);
    strict_1.default.equal(cov[0].backorder, false); // nothing has shipped yet
});
(0, node_test_1.test)('part-shipped line: un-shipped remainder auto-flags as backorder (spec §9.4)', () => {
    const cov = (0, deliveryLogic_1.computeDeliveryCoverage)(ORDER_LINES, [dl('L1', 4, 'dispatched')]);
    strict_1.default.equal(cov[0].shipped, 4);
    strict_1.default.equal(cov[0].remainingToAssign, 2);
    strict_1.default.equal(cov[0].backorder, true);
    strict_1.default.equal(cov[0].backorderQty, 2);
    // The untouched line is not a backorder
    strict_1.default.equal(cov[1].backorder, false);
});
(0, node_test_1.test)('remainder scheduled on a second pending delivery clears the backorder', () => {
    const cov = (0, deliveryLogic_1.computeDeliveryCoverage)(ORDER_LINES, [
        dl('L1', 4, 'delivered'),
        dl('L1', 2, 'pending'),
    ]);
    strict_1.default.equal(cov[0].assigned, 6);
    strict_1.default.equal(cov[0].remainingToAssign, 0);
    strict_1.default.equal(cov[0].backorder, false);
});
(0, node_test_1.test)('failed/returned deliveries release their assignment', () => {
    const cov = (0, deliveryLogic_1.computeDeliveryCoverage)(ORDER_LINES, [
        dl('L1', 4, 'failed'),
        dl('L1', 2, 'returned'),
    ]);
    strict_1.default.equal(cov[0].assigned, 0);
    strict_1.default.equal(cov[0].shipped, 0);
    strict_1.default.equal(cov[0].remainingToAssign, 6);
    strict_1.default.equal(cov[0].backorder, false);
});
(0, node_test_1.test)('open shortage exceptions add to the backorder quantity', () => {
    const cov = (0, deliveryLogic_1.computeDeliveryCoverage)(ORDER_LINES, [dl('L1', 6, 'partially_delivered', 'DL-1')], [{ delivery_line_id: 'DL-1', type: 'shortage', quantity_affected: 2, resolution_status: 'open' }]);
    strict_1.default.equal(cov[0].shipped, 6);
    strict_1.default.equal(cov[0].remainingToAssign, 0);
    strict_1.default.equal(cov[0].shortfall, 2);
    strict_1.default.equal(cov[0].backorder, true);
    strict_1.default.equal(cov[0].backorderQty, 2);
});
(0, node_test_1.test)('resolved/credited shortages stop counting; damage never adds backorder qty', () => {
    const covResolved = (0, deliveryLogic_1.computeDeliveryCoverage)(ORDER_LINES, [dl('L1', 6, 'delivered', 'DL-1')], [{ delivery_line_id: 'DL-1', type: 'shortage', quantity_affected: 2, resolution_status: 'resolved' }]);
    strict_1.default.equal(covResolved[0].backorder, false);
    const covDamage = (0, deliveryLogic_1.computeDeliveryCoverage)(ORDER_LINES, [dl('L1', 6, 'delivered', 'DL-1')], [{ delivery_line_id: 'DL-1', type: 'damage', quantity_affected: 2, resolution_status: 'open' }]);
    strict_1.default.equal(covDamage[0].shortfall, 0);
    strict_1.default.equal(covDamage[0].backorder, false);
});
(0, node_test_1.test)('fully shipped line is never a backorder', () => {
    const cov = (0, deliveryLogic_1.computeDeliveryCoverage)(ORDER_LINES, [
        dl('L1', 3, 'delivered'),
        dl('L1', 3, 'delivered'),
    ]);
    strict_1.default.equal(cov[0].shipped, 6);
    strict_1.default.equal(cov[0].backorder, false);
});
// ── Quantity validation ─────────────────────────────────────
(0, node_test_1.test)('validateAssignQuantity enforces the un-assigned remainder', () => {
    strict_1.default.equal((0, deliveryLogic_1.validateAssignQuantity)({ ordered: 6, alreadyAssigned: 0, quantity: 6 }), null);
    strict_1.default.equal((0, deliveryLogic_1.validateAssignQuantity)({ ordered: 6, alreadyAssigned: 4, quantity: 2 }), null);
    strict_1.default.notEqual((0, deliveryLogic_1.validateAssignQuantity)({ ordered: 6, alreadyAssigned: 4, quantity: 3 }), null);
    strict_1.default.notEqual((0, deliveryLogic_1.validateAssignQuantity)({ ordered: 6, alreadyAssigned: 0, quantity: 0 }), null);
    strict_1.default.notEqual((0, deliveryLogic_1.validateAssignQuantity)({ ordered: 6, alreadyAssigned: 0, quantity: -1 }), null);
    strict_1.default.notEqual((0, deliveryLogic_1.validateAssignQuantity)({ ordered: 6, alreadyAssigned: 0, quantity: NaN }), null);
});
// ── No-price guard ──────────────────────────────────────────
(0, node_test_1.test)('a clean delivery-note-shaped snapshot passes the guard', () => {
    const snap = {
        docType: 'delivery_note',
        deliveryNumber: 'FBA-DEL-2026-0001',
        orderNumber: 'FBA-SO-2026-0003',
        proformaReference: 'FBA-2026-0009',
        delivery: { origin_type: 'consolidated', carrier: 'DHL', instructions: 'Ring twice' },
        location: { label: 'Main site', address_line1: '1 King St', postcode: 'SW1A 1AA', access_notes: 'Goods lift' },
        contacts: [{ name: 'Ade', role: 'Site manager', phone: '07000', email: 'a@b.c', is_primary: true }],
        client: { name: 'Jane', company: 'Studio X' },
        lines: [{
                id: 'x', name: 'Chair', quantity: 2, ordered_quantity: 6, unit_of_measure: 'each',
                selected_finish: 'Walnut', purchase_order_number: 'FBA-PO-2026-0002', notes: null,
            }],
        packages: [{ reference: 'TRK123', weight: '30kg', dimensions: '120×80×90cm' }],
        settings: { company_legal_name: 'FBA Ltd', company_registration_number: '123', contact_email: 'x@y.z' },
    };
    strict_1.default.deepEqual((0, deliveryLogic_1.findForbiddenDeliveryFields)(snap), []);
});
(0, node_test_1.test)('the guard catches money fields at any depth, including arrays', () => {
    const hits1 = (0, deliveryLogic_1.findForbiddenDeliveryFields)({ lines: [{ name: 'Chair', selling_price_unit: 100 }] });
    strict_1.default.ok(hits1.some(h => h.includes('selling_price_unit')), JSON.stringify(hits1));
    const hits2 = (0, deliveryLogic_1.findForbiddenDeliveryFields)({ a: { b: { supplier_cost_unit: 5 } } });
    strict_1.default.ok(hits2.some(h => h.endsWith('a.b.supplier_cost_unit')));
    for (const bad of [
        { line_net_total: 1 }, { gross_total: 1 }, { vat_number: 'GB1' }, { bank_name: 'X' },
        { unit_price: 9 }, { discount_amount: 1 }, { deposit_percent: 50 }, { margin_percent: 30 },
        { markup: 1.4 }, { subtotal: 10 }, { balance_due: 2 }, { tax_total: 3 }, { payment_terms: '30d' },
        { procurement_fee: 12 },
    ]) {
        strict_1.default.ok((0, deliveryLogic_1.findForbiddenDeliveryFields)(bad).length > 0, `expected hit for ${JSON.stringify(bad)}`);
    }
});
(0, node_test_1.test)('the guard allows price-free lookalike keys', () => {
    strict_1.default.deepEqual((0, deliveryLogic_1.findForbiddenDeliveryFields)({ quantity_affected: 2 }), []);
    strict_1.default.deepEqual((0, deliveryLogic_1.findForbiddenDeliveryFields)({ postcode: 'SW1' }), []);
    strict_1.default.deepEqual((0, deliveryLogic_1.findForbiddenDeliveryFields)({ access_notes: 'lift', instructions: 'call ahead' }), []);
});
