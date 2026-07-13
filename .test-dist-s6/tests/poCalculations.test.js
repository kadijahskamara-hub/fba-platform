"use strict";
// ============================================================
// Supplier purchase-order calculation tests (Sprint 2, spec §23).
// Node built-in test runner: npm test
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const poCalculations_1 = require("../lib/commercial/poCalculations");
function poInput(overrides = {}) {
    return {
        lines: [{ quantity: 2, supplierCostUnit: 100, discountAmount: 0, taxCategory: 'standard', taxRate: 20 }],
        shippingTotal: 0, packagingTotal: 0, otherChargesTotal: 0,
        documentDiscount: 0, chargesTaxRate: null,
        ...overrides,
    };
}
function ctx(overrides = {}) {
    return {
        valueThreshold: null, freightThreshold: null, manufacturerActive: true,
        costDiffersFromAllocation: false, quantityDiffersFromAllocation: false,
        currencyDiffersFromDefault: false, costOverridden: false, marginAtRisk: false,
        ...overrides,
    };
}
// 3. Service lines are excluded from procurement by default
(0, node_test_1.test)('service lines are not procurement-eligible; product/delivery/installation are', () => {
    strict_1.default.equal((0, poCalculations_1.lineEligibleForProcurement)('service'), false);
    strict_1.default.equal((0, poCalculations_1.lineEligibleForProcurement)('fee'), false);
    strict_1.default.equal((0, poCalculations_1.lineEligibleForProcurement)('adjustment'), false);
    strict_1.default.equal((0, poCalculations_1.lineEligibleForProcurement)('product'), true);
    strict_1.default.equal((0, poCalculations_1.lineEligibleForProcurement)('delivery'), true);
    strict_1.default.equal((0, poCalculations_1.lineEligibleForProcurement)('installation'), true);
});
// 4. Missing supplier cost blocks readiness
(0, node_test_1.test)('missing supplier cost blocks allocation readiness', () => {
    const r = (0, poCalculations_1.assessAllocationReadiness)({
        manufacturerId: 'm1', supplierCostUnit: null, supplierCurrency: 'GBP',
        quantity: 1, sourceQuantity: 1,
    });
    strict_1.default.equal(r.ready, false);
    strict_1.default.ok(r.problems.some(p => p.includes('Supplier cost unavailable')));
});
// 5. Missing manufacturer blocks allocation
(0, node_test_1.test)('missing manufacturer blocks allocation readiness', () => {
    const r = (0, poCalculations_1.assessAllocationReadiness)({
        manufacturerId: null, supplierCostUnit: 50, supplierCurrency: 'GBP',
        quantity: 1, sourceQuantity: 1,
    });
    strict_1.default.equal(r.ready, false);
    strict_1.default.ok(r.problems.some(p => p.includes('No manufacturer')));
});
// 6. Allocation quantity cannot exceed sales-order quantity
(0, node_test_1.test)('allocation quantity cannot exceed the client-order quantity (incl. split allocations)', () => {
    const over = (0, poCalculations_1.assessAllocationReadiness)({
        manufacturerId: 'm1', supplierCostUnit: 50, supplierCurrency: 'GBP',
        quantity: 5, sourceQuantity: 4,
    });
    strict_1.default.equal(over.ready, false);
    strict_1.default.ok(over.problems.some(p => p.includes('exceeds the client-order quantity')));
    const split = (0, poCalculations_1.assessAllocationReadiness)({
        manufacturerId: 'm1', supplierCostUnit: 50, supplierCurrency: 'GBP',
        quantity: 2, sourceQuantity: 4, otherAllocatedQuantity: 3,
    });
    strict_1.default.equal(split.ready, false);
    const ok = (0, poCalculations_1.assessAllocationReadiness)({
        manufacturerId: 'm1', supplierCostUnit: 50, supplierCurrency: 'GBP',
        quantity: 2, sourceQuantity: 4, otherAllocatedQuantity: 2,
    });
    strict_1.default.equal(ok.ready, true);
});
// 7. Supplier PO uses cost (not client selling price) — the engine only
//    accepts supplierCostUnit; verify arithmetic uses it.
(0, node_test_1.test)('PO line totals derive from supplier cost', () => {
    const l = (0, poCalculations_1.calculatePoLine)({ quantity: 3, supplierCostUnit: 250, discountAmount: 0, taxCategory: 'zero', taxRate: null });
    strict_1.default.equal(l.lineNetTotal, 750);
    strict_1.default.equal(l.lineGrossTotal, 750);
});
// 9. PO totals reconcile
(0, node_test_1.test)('PO totals reconcile: lines + charges − discounts + tax = grand total', () => {
    const r = (0, poCalculations_1.calculatePurchaseOrder)(poInput({
        lines: [
            { quantity: 2, supplierCostUnit: 100, discountAmount: 10, taxCategory: 'standard', taxRate: 20 },
            { quantity: 1, supplierCostUnit: 59.99, discountAmount: 0, taxCategory: 'zero', taxRate: null },
        ],
        shippingTotal: 45, packagingTotal: 15, documentDiscount: 5,
    }));
    // lines net: (200-10) + 59.99 = 249.99; charges 60; doc discount 5 → net 304.99
    strict_1.default.equal(r.netSubtotal, 304.99);
    // tax: 20% of 190 = 38
    strict_1.default.equal(r.taxTotal, 38);
    strict_1.default.equal(r.grandTotal, 342.99);
    strict_1.default.ok(Math.abs((r.netSubtotal + r.taxTotal) - r.grandTotal) < 0.005);
});
// 10. Supplier tax categories calculate correctly
(0, node_test_1.test)('supplier tax categories: standard/reduced rated, others zero', () => {
    const r = (0, poCalculations_1.calculatePurchaseOrder)(poInput({
        lines: [
            { quantity: 1, supplierCostUnit: 100, discountAmount: 0, taxCategory: 'standard', taxRate: 20 },
            { quantity: 1, supplierCostUnit: 100, discountAmount: 0, taxCategory: 'reduced', taxRate: 5 },
            { quantity: 1, supplierCostUnit: 100, discountAmount: 0, taxCategory: 'reverse_charge', taxRate: null },
            { quantity: 1, supplierCostUnit: 100, discountAmount: 0, taxCategory: 'exempt', taxRate: null },
        ],
    }));
    strict_1.default.equal(r.taxByCategory.standard, 20);
    strict_1.default.equal(r.taxByCategory.reduced, 5);
    strict_1.default.equal(r.taxTotal, 25);
});
// 11. Unknown supplier tax blocks issue
(0, node_test_1.test)('unknown supplier tax blocks approval/issue', () => {
    const r = (0, poCalculations_1.calculatePurchaseOrder)(poInput({
        lines: [{ quantity: 1, supplierCostUnit: 100, discountAmount: 0, taxCategory: 'unknown', taxRate: null }],
    }));
    strict_1.default.equal(r.hasUnknownTax, true);
    const approval = (0, poCalculations_1.evaluatePoApproval)(r, ctx());
    strict_1.default.equal(approval.blocked, true);
    strict_1.default.ok(approval.reasons.some(x => x.includes('unknown supplier tax')));
});
// 12/13. Cost override + thresholds trigger approval
(0, node_test_1.test)('cost override, thresholds and inactive manufacturer trigger approval', () => {
    const calc = (0, poCalculations_1.calculatePurchaseOrder)(poInput({ shippingTotal: 500 }));
    const a = (0, poCalculations_1.evaluatePoApproval)(calc, ctx({ costOverridden: true }));
    strict_1.default.equal(a.required, true);
    strict_1.default.ok(a.reasons.some(r => r.includes('manually overridden')));
    const b = (0, poCalculations_1.evaluatePoApproval)(calc, ctx({ valueThreshold: 100 }));
    strict_1.default.equal(b.required, true);
    const c = (0, poCalculations_1.evaluatePoApproval)(calc, ctx({ freightThreshold: 100 }));
    strict_1.default.equal(c.required, true);
    const d = (0, poCalculations_1.evaluatePoApproval)(calc, ctx({ manufacturerActive: false }));
    strict_1.default.equal(d.required, true);
    const clean = (0, poCalculations_1.evaluatePoApproval)((0, poCalculations_1.calculatePurchaseOrder)(poInput()), ctx());
    strict_1.default.equal(clean.required, false);
    strict_1.default.equal(clean.blocked, false);
});
// 23. Margin-at-risk triggered by supplier-cost increase
(0, node_test_1.test)('margin-at-risk triggers when a cost increase pushes margin below thresholds', () => {
    // Client sells at 1000; originally expected cost 600 (40% margin);
    // PO cost rises to 750 → 25% margin < 30% commercial threshold.
    const m = (0, poCalculations_1.analyseMarginAtRisk)({
        clientNetSelling: 1000, originalExpectedCost: 600, currentPoCost: 750,
        marginCommercialBelow: 30, marginUltraBelow: 20,
    });
    strict_1.default.equal(m.atRisk, true);
    strict_1.default.equal(m.level, 'commercial');
    strict_1.default.equal(m.costVariance, 150);
    strict_1.default.equal(m.expectedMarginPercent, 25);
    // Below ultra threshold
    const u = (0, poCalculations_1.analyseMarginAtRisk)({
        clientNetSelling: 1000, originalExpectedCost: 600, currentPoCost: 850,
        marginCommercialBelow: 30, marginUltraBelow: 20,
    });
    strict_1.default.equal(u.level, 'ultra');
    // No increase → no risk flag even if margin was always thin
    const stable = (0, poCalculations_1.analyseMarginAtRisk)({
        clientNetSelling: 1000, originalExpectedCost: 750, currentPoCost: 750,
        marginCommercialBelow: 30, marginUltraBelow: 20,
    });
    strict_1.default.equal(stable.atRisk, false);
});
(0, node_test_1.test)('margin-at-risk feeds the PO approval evaluation', () => {
    const calc = (0, poCalculations_1.calculatePurchaseOrder)(poInput());
    const a = (0, poCalculations_1.evaluatePoApproval)(calc, ctx({ marginAtRisk: true }));
    strict_1.default.equal(a.required, true);
    strict_1.default.ok(a.reasons.some(r => r.includes('Margin at risk')));
});
// 8/24. Supplier-safe output contains no client selling values
(0, node_test_1.test)('supplier-safe snapshot scanner catches client commercial fields', () => {
    const safeSnapshot = {
        documentNumber: 'FBA-PO-2026-0001',
        lines: [{ product_name: 'Chair', supplier_cost_unit: 100, quantity: 2, line_net_total: 200 }],
        totals: { netSubtotal: 200, taxTotal: 40, grandTotal: 240 },
    };
    strict_1.default.deepEqual((0, poCalculations_1.findForbiddenSupplierFields)(safeSnapshot), []);
    const leaky = {
        lines: [{ product_name: 'Chair', supplier_cost_unit: 100, selling_price_unit: 300 }],
        analysis: { marginPercent: 66 },
    };
    const hits = (0, poCalculations_1.findForbiddenSupplierFields)(leaky);
    strict_1.default.ok(hits.some(hit => hit.includes('selling_price_unit')));
    strict_1.default.ok(hits.some(hit => hit.includes('marginPercent')));
});
// Discount handling on PO lines
(0, node_test_1.test)('PO line discounts cap at the line subtotal and reduce tax', () => {
    const l = (0, poCalculations_1.calculatePoLine)({ quantity: 1, supplierCostUnit: 100, discountAmount: 150, taxCategory: 'standard', taxRate: 20 });
    strict_1.default.equal(l.discountAmount, 100); // capped
    strict_1.default.equal(l.lineNetTotal, 0);
    strict_1.default.equal(l.lineTaxTotal, 0);
});
// Empty PO is blocked
(0, node_test_1.test)('a PO with no lines is blocked', () => {
    const calc = (0, poCalculations_1.calculatePurchaseOrder)(poInput({ lines: [] }));
    const a = (0, poCalculations_1.evaluatePoApproval)(calc, ctx());
    strict_1.default.equal(a.blocked, true);
});
