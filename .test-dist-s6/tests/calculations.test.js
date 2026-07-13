"use strict";
// ============================================================
// Commercial calculation engine tests (Sprint 1, spec §18).
// Runs on Node's built-in test runner — no framework added:
//   npm test  →  tsc -p tsconfig.test.json && node --test
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const calculations_1 = require("../lib/commercial/calculations");
const types_1 = require("../lib/commercial/types");
const RATES = { standard: 20, reduced: 5 };
function line(overrides = {}) {
    return {
        lineType: 'product',
        quantity: 1,
        supplierCostUnit: 100,
        pricingMethod: 'markup',
        pricingPercent: 50,
        sellingPriceUnit: null,
        discountType: null,
        discountValue: null,
        taxCategory: 'standard',
        procurementFeeEligible: true,
        ...overrides,
    };
}
function doc(overrides = {}) {
    return {
        lines: [line()],
        vatRegistered: true,
        taxRates: RATES,
        depositPercent: 50,
        depositBasis: 'gross_total',
        procurementFee: { type: 'none', basis: 'product_selling_subtotal', value: 0 },
        paymentsReceived: 0,
        thresholds: { ...types_1.DEFAULT_APPROVAL_THRESHOLDS },
        ...overrides,
    };
}
// 1. 30% markup from £100 cost → £130 selling
(0, node_test_1.test)('markup 30% on £100 cost gives £130 selling price', () => {
    const r = (0, calculations_1.calculateLine)(line({ pricingPercent: 30 }), true, RATES);
    strict_1.default.equal(r.sellingPriceUnit, 130);
});
// 2. 30% margin from £100 cost → ≈£142.86
(0, node_test_1.test)('margin 30% on £100 cost gives ~£142.86 selling price', () => {
    const r = (0, calculations_1.calculateLine)(line({ pricingMethod: 'margin', pricingPercent: 30 }), true, RATES);
    strict_1.default.equal(r.sellingPriceUnit, 142.86);
});
// 3. Switching markup → margin preserves cost
(0, node_test_1.test)('switching method recalculates selling from the same cost basis', () => {
    const markup = (0, calculations_1.calculateLine)(line({ pricingPercent: 30 }), true, RATES);
    const margin = (0, calculations_1.calculateLine)(line({ pricingMethod: 'margin', pricingPercent: 30 }), true, RATES);
    strict_1.default.equal(markup.supplierCostUnit, 100);
    strict_1.default.equal(margin.supplierCostUnit, 100); // cost untouched
    strict_1.default.notEqual(markup.sellingPriceUnit, margin.sellingPriceUnit);
});
// 4. Zero-cost handling
(0, node_test_1.test)('zero cost is flagged and never crashes', () => {
    const r = (0, calculations_1.calculateLine)(line({ supplierCostUnit: 0, pricingPercent: 30 }), true, RATES);
    strict_1.default.equal(r.sellingPriceUnit, 0);
    strict_1.default.equal(r.flags.zeroCost, true);
    const inv = (0, calculations_1.deriveSellingMinor)(0, 'margin', 100);
    strict_1.default.equal(inv.invalid, true); // margin ≥ 100% is invalid
});
// 5. Negative-margin blocking
(0, node_test_1.test)('negative margin line blocks the document', () => {
    const d = (0, calculations_1.calculateDocument)(doc({
        lines: [line({ pricingMethod: 'manual', sellingPriceUnit: 80 })], // cost 100, sell 80
    }));
    strict_1.default.equal(d.approval.level, 'blocked');
    strict_1.default.ok(d.approval.reasons.some(r => r.includes('Negative margin')));
});
// 6. Percentage discount
(0, node_test_1.test)('10% discount on £200 line yields £180 net', () => {
    const r = (0, calculations_1.calculateLine)(line({
        pricingMethod: 'manual', sellingPriceUnit: 200,
        discountType: 'percent', discountValue: 10, supplierCostUnit: null,
    }), true, RATES);
    strict_1.default.equal(r.discountAmount, 20);
    strict_1.default.equal(r.lineNetTotal, 180);
});
// 7. Fixed discount
(0, node_test_1.test)('fixed £25 discount is applied and capped at the line value', () => {
    const r = (0, calculations_1.calculateLine)(line({ pricingMethod: 'manual', sellingPriceUnit: 200, supplierCostUnit: null, discountType: 'fixed', discountValue: 25 }), true, RATES);
    strict_1.default.equal(r.discountAmount, 25);
    strict_1.default.equal(r.lineNetTotal, 175);
    const capped = (0, calculations_1.calculateLine)(line({ pricingMethod: 'manual', sellingPriceUnit: 10, supplierCostUnit: null, discountType: 'fixed', discountValue: 25 }), true, RATES);
    strict_1.default.equal(capped.lineNetTotal, 0); // never negative
});
// 8. Standard VAT
(0, node_test_1.test)('standard VAT 20% applies to the net amount', () => {
    const r = (0, calculations_1.calculateLine)(line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null }), true, RATES);
    strict_1.default.equal(r.lineTaxTotal, 20);
    strict_1.default.equal(r.lineGrossTotal, 120);
});
// 9. Zero-rated line
(0, node_test_1.test)('zero-rated line carries no VAT', () => {
    const r = (0, calculations_1.calculateLine)(line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null, taxCategory: 'zero' }), true, RATES);
    strict_1.default.equal(r.lineTaxTotal, 0);
    strict_1.default.equal(r.lineGrossTotal, 100);
});
// 10. Mixed VAT categories
(0, node_test_1.test)('mixed VAT categories are totalled per category', () => {
    const d = (0, calculations_1.calculateDocument)(doc({
        lines: [
            line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null }), // standard: 20
            line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null, taxCategory: 'reduced' }), // reduced: 5
            line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null, taxCategory: 'exempt' }), // 0
        ],
    }));
    strict_1.default.equal(d.vatByCategory.standard, 20);
    strict_1.default.equal(d.vatByCategory.reduced, 5);
    strict_1.default.equal(d.vatTotal, 25);
    strict_1.default.equal(d.grossTotal, 325);
});
// 11. Product and service subtotals
(0, node_test_1.test)('product and service subtotals are separated', () => {
    const d = (0, calculations_1.calculateDocument)(doc({
        lines: [
            line({ pricingMethod: 'manual', sellingPriceUnit: 500, supplierCostUnit: 250 }),
            line({ lineType: 'service', pricingMethod: 'manual', sellingPriceUnit: 300, supplierCostUnit: null }),
            line({ lineType: 'delivery', pricingMethod: 'manual', sellingPriceUnit: 50, supplierCostUnit: null }),
        ],
    }));
    strict_1.default.equal(d.productSellingSubtotal, 500);
    strict_1.default.equal(d.serviceSubtotal, 300);
    strict_1.default.equal(d.otherChargesSubtotal, 50);
    strict_1.default.equal(d.netSubtotal, 850);
});
// 12. Procurement percentage fee
(0, node_test_1.test)('12% procurement fee on the product selling subtotal', () => {
    const d = (0, calculations_1.calculateDocument)(doc({
        lines: [line({ pricingMethod: 'manual', sellingPriceUnit: 85000, supplierCostUnit: null })],
        procurementFee: { type: 'percentage', basis: 'product_selling_subtotal', value: 12 },
    }));
    strict_1.default.equal(d.procurementFeeBasisAmount, 85000);
    strict_1.default.equal(d.procurementFee, 10200);
    strict_1.default.equal(d.netSubtotal, 95200);
});
// 13. Fixed procurement fee
(0, node_test_1.test)('fixed procurement fee is added regardless of basis amount', () => {
    const d = (0, calculations_1.calculateDocument)(doc({
        procurementFee: { type: 'fixed', basis: 'product_selling_subtotal', value: 1500 },
    }));
    strict_1.default.equal(d.procurementFee, 1500);
});
// 14. Deposit calculation
(0, node_test_1.test)('deposit requested is 50% of gross total (and labelled requested, not paid)', () => {
    const d = (0, calculations_1.calculateDocument)(doc({
        lines: [line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null })],
    }));
    strict_1.default.equal(d.grossTotal, 120);
    strict_1.default.equal(d.depositRequested, 60);
    strict_1.default.equal(d.paymentsReceived, 0); // separate concept
    strict_1.default.equal(d.balanceDue, 120);
});
// 15. Rounding across multiple quantities
(0, node_test_1.test)('rounding: 3 × £33.335 rounds once at line level (minor units, half-up)', () => {
    const r = (0, calculations_1.calculateLine)(line({ pricingMethod: 'manual', sellingPriceUnit: 33.335, supplierCostUnit: null, quantity: 3 }), true, RATES);
    // unit stored as 3334p (33.34) → 3 × 3334 = 10002p = £100.02
    strict_1.default.equal(r.lineNetTotal, 100.02);
    strict_1.default.equal((0, calculations_1.toMinor)((0, calculations_1.fromMinor)((0, calculations_1.toMinor)(33.335))), 3334);
});
// 16. Quote-level total reconciliation
(0, node_test_1.test)('document totals reconcile: net + VAT = gross; sections sum to net', () => {
    const d = (0, calculations_1.calculateDocument)(doc({
        lines: [
            line({ pricingPercent: 30 }), // 130 std
            line({ lineType: 'service', pricingMethod: 'manual', sellingPriceUnit: 250, supplierCostUnit: null }),
            line({ pricingMethod: 'manual', sellingPriceUnit: 99.99, supplierCostUnit: 50, discountType: 'percent', discountValue: 5 }),
        ],
        procurementFee: { type: 'percentage', basis: 'product_selling_subtotal', value: 10 },
    }));
    const sections = d.productSellingSubtotal + d.serviceSubtotal + d.otherChargesSubtotal + d.procurementFee;
    strict_1.default.ok(Math.abs(sections - d.netSubtotal) < 0.011);
    strict_1.default.ok(Math.abs(d.netSubtotal + d.vatTotal - d.grossTotal) < 0.011);
});
// 17. Approval threshold at exactly 30%
(0, node_test_1.test)('margin of exactly 30% requires no approval', () => {
    // margin 30%: cost 70, sell 100
    const d = (0, calculations_1.calculateDocument)(doc({
        lines: [line({ supplierCostUnit: 70, pricingMethod: 'manual', sellingPriceUnit: 100 })],
    }));
    strict_1.default.equal(d.approval.level, 'none');
});
// 18. Approval threshold below 30%
(0, node_test_1.test)('margin below 30% requires Commercial Admin approval', () => {
    const d = (0, calculations_1.calculateDocument)(doc({
        lines: [line({ supplierCostUnit: 75, pricingMethod: 'manual', sellingPriceUnit: 100 })], // 25% margin
    }));
    strict_1.default.equal(d.approval.level, 'commercial');
});
// 19. Ultra Admin threshold below 20%
(0, node_test_1.test)('margin below 20% requires Ultra Admin approval', () => {
    const d = (0, calculations_1.calculateDocument)(doc({
        lines: [line({ supplierCostUnit: 90, pricingMethod: 'manual', sellingPriceUnit: 100 })], // 10% margin
    }));
    strict_1.default.equal(d.approval.level, 'ultra');
});
// 20. Discount approval thresholds
(0, node_test_1.test)('discounts above 10% / 20% escalate approval', () => {
    const base = { pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null };
    const c = (0, calculations_1.calculateDocument)(doc({ lines: [line({ ...base, discountType: 'percent', discountValue: 15 })] }));
    strict_1.default.equal(c.approval.level, 'commercial');
    const u = (0, calculations_1.calculateDocument)(doc({ lines: [line({ ...base, discountType: 'percent', discountValue: 25 })] }));
    strict_1.default.equal(u.approval.level, 'ultra');
    const ok = (0, calculations_1.calculateDocument)(doc({ lines: [line({ ...base, discountType: 'percent', discountValue: 10 })] }));
    strict_1.default.equal(ok.approval.level, 'none');
});
// 23. Server rejection of tampered client totals
(0, node_test_1.test)('tampered client totals are detected', () => {
    const d = (0, calculations_1.calculateDocument)(doc({
        lines: [line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null })],
    }));
    strict_1.default.deepEqual((0, calculations_1.verifyClientTotals)({ grossTotal: 120 }, d), []);
    const mismatches = (0, calculations_1.verifyClientTotals)({ grossTotal: 1.99, netSubtotal: 100 }, d);
    strict_1.default.equal(mismatches.length, 1);
    strict_1.default.match(mismatches[0], /grossTotal/);
});
// Supporting behaviours
(0, node_test_1.test)('cost-unavailable lines never fabricate margins', () => {
    const d = (0, calculations_1.calculateDocument)(doc({
        lines: [line({ supplierCostUnit: null, pricingMethod: 'manual', sellingPriceUnit: 100 })],
    }));
    strict_1.default.equal(d.costIncomplete, true);
    strict_1.default.equal(d.effectiveMarginPercent, null);
    strict_1.default.equal(d.productCostSubtotal, null);
    strict_1.default.equal(d.approval.level, 'none'); // unknown cost is not treated as negative margin
});
(0, node_test_1.test)('manual supplier-cost override requires Commercial Admin approval', () => {
    const d = (0, calculations_1.calculateDocument)(doc({ supplierCostOverridden: true }));
    strict_1.default.equal(d.approval.level, 'commercial');
});
(0, node_test_1.test)('procurement fee override requires Commercial Admin approval', () => {
    const d = (0, calculations_1.calculateDocument)(doc({
        procurementFee: { type: 'percentage', basis: 'product_selling_subtotal', value: 10, override: 500 },
    }));
    strict_1.default.equal(d.procurementFee, 500);
    strict_1.default.equal(d.procurementFeeOverridden, true);
    strict_1.default.equal(d.approval.level, 'commercial');
});
(0, node_test_1.test)('deposit value rules override the default by order value', () => {
    const rules = [
        { min_order_value: 0, deposit_percent: 100 }, // small orders: full payment
        { min_order_value: 2000, deposit_percent: 50 }, // larger orders: 50%
    ];
    strict_1.default.equal((0, calculations_1.resolveDepositPercent)(50, rules, 1500), 100);
    strict_1.default.equal((0, calculations_1.resolveDepositPercent)(50, rules, 5000), 50);
    strict_1.default.equal((0, calculations_1.resolveDepositPercent)(50, [], 5000), 50);
});
(0, node_test_1.test)('VAT-unregistered documents apply no VAT anywhere', () => {
    const d = (0, calculations_1.calculateDocument)(doc({
        vatRegistered: false,
        lines: [line({ pricingMethod: 'manual', sellingPriceUnit: 100, supplierCostUnit: null })],
        procurementFee: { type: 'fixed', basis: 'product_selling_subtotal', value: 100 },
    }));
    strict_1.default.equal(d.vatTotal, 0);
    strict_1.default.equal(d.grossTotal, 200);
});
