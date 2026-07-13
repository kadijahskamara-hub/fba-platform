"use strict";
// ============================================================
// Supplier-side purchase-order calculation engine (Sprint 2).
//
// Pure module (no server imports) reusing the Sprint 1 minor-unit
// money utilities. This is deliberately SEPARATE from the client
// calculation engine: purchase orders work in supplier costs and
// supplier tax treatment, and must never include FBA margin,
// client VAT treatment, client fees, deposits or discounts.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPLIER_FORBIDDEN_FIELDS = exports.PROCUREMENT_ELIGIBLE_LINE_TYPES = exports.SUPPLIER_TAX_CATEGORIES = void 0;
exports.lineEligibleForProcurement = lineEligibleForProcurement;
exports.assessAllocationReadiness = assessAllocationReadiness;
exports.calculatePoLine = calculatePoLine;
exports.calculatePurchaseOrder = calculatePurchaseOrder;
exports.evaluatePoApproval = evaluatePoApproval;
exports.analyseMarginAtRisk = analyseMarginAtRisk;
exports.findForbiddenSupplierFields = findForbiddenSupplierFields;
const calculations_1 = require("./calculations");
exports.SUPPLIER_TAX_CATEGORIES = ['standard', 'reduced', 'zero', 'exempt', 'outside_scope', 'reverse_charge', 'unknown'];
/** Line types eligible for manufacturer procurement (spec §5). */
exports.PROCUREMENT_ELIGIBLE_LINE_TYPES = ['product', 'delivery', 'installation'];
function lineEligibleForProcurement(lineType) {
    return exports.PROCUREMENT_ELIGIBLE_LINE_TYPES.includes(lineType);
}
function assessAllocationReadiness(a) {
    const problems = [];
    if (!a.manufacturerId)
        problems.push('No manufacturer assigned.');
    if (a.supplierCostUnit === null || a.supplierCostUnit === undefined)
        problems.push('Supplier cost unavailable — enter the cost or exclude the line from procurement.');
    if (a.supplierCostUnit !== null && a.supplierCostUnit !== undefined && a.supplierCostUnit < 0)
        problems.push('Supplier cost cannot be negative.');
    if (!a.supplierCurrency)
        problems.push('Supplier currency unknown.');
    if (!(a.quantity > 0))
        problems.push('Quantity must be greater than zero.');
    const already = a.otherAllocatedQuantity ?? 0;
    if (a.quantity + already > a.sourceQuantity + 1e-9) {
        problems.push(`Allocated quantity (${a.quantity + already}) exceeds the client-order quantity (${a.sourceQuantity}).`);
    }
    return { ready: problems.length === 0, problems };
}
function supplierTaxRateFor(category, rate) {
    switch (category) {
        case 'standard':
        case 'reduced':
            return rate ?? 0;
        default:
            return 0; // zero / exempt / outside_scope / reverse_charge / unknown
    }
}
function calculatePoLine(input) {
    const qty = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 0;
    const costMinor = (0, calculations_1.toMinor)(input.supplierCostUnit);
    const subtotalMinor = (0, calculations_1.roundHalfUp)(costMinor * qty);
    const discountMinor = Math.min(Math.max((0, calculations_1.toMinor)(input.discountAmount ?? 0), 0), subtotalMinor);
    const netMinor = subtotalMinor - discountMinor;
    const rate = supplierTaxRateFor(input.taxCategory, input.taxRate);
    const taxMinor = (0, calculations_1.roundHalfUp)((netMinor * rate) / 100);
    return {
        id: input.id,
        quantity: qty,
        supplierCostUnit: (0, calculations_1.fromMinor)(costMinor),
        lineSubtotal: (0, calculations_1.fromMinor)(subtotalMinor),
        discountAmount: (0, calculations_1.fromMinor)(discountMinor),
        lineNetTotal: (0, calculations_1.fromMinor)(netMinor),
        taxCategory: input.taxCategory,
        taxRate: rate,
        lineTaxTotal: (0, calculations_1.fromMinor)(taxMinor),
        lineGrossTotal: (0, calculations_1.fromMinor)(netMinor + taxMinor),
        unknownTax: input.taxCategory === 'unknown',
    };
}
function calculatePurchaseOrder(input) {
    const lines = input.lines.map(calculatePoLine);
    const lineSubtotalMinor = lines.reduce((s, l) => s + (0, calculations_1.toMinor)(l.lineSubtotal), 0);
    const lineDiscountMinor = lines.reduce((s, l) => s + (0, calculations_1.toMinor)(l.discountAmount), 0);
    const lineNetMinor = lines.reduce((s, l) => s + (0, calculations_1.toMinor)(l.lineNetTotal), 0);
    const shippingMinor = Math.max((0, calculations_1.toMinor)(input.shippingTotal ?? 0), 0);
    const packagingMinor = Math.max((0, calculations_1.toMinor)(input.packagingTotal ?? 0), 0);
    const otherMinor = Math.max((0, calculations_1.toMinor)(input.otherChargesTotal ?? 0), 0);
    const chargesMinor = shippingMinor + packagingMinor + otherMinor;
    const docDiscountMinor = Math.min(Math.max((0, calculations_1.toMinor)(input.documentDiscount ?? 0), 0), lineNetMinor + chargesMinor);
    const netMinor = lineNetMinor + chargesMinor - docDiscountMinor;
    const taxByCategory = {};
    let taxMinor = 0;
    for (const l of lines) {
        const m = (0, calculations_1.toMinor)(l.lineTaxTotal);
        if (m !== 0 || l.taxRate > 0) {
            taxByCategory[l.taxCategory] = (taxByCategory[l.taxCategory] ?? 0) + (0, calculations_1.fromMinor)(m);
        }
        taxMinor += m;
    }
    if (input.chargesTaxRate != null && chargesMinor > 0) {
        const chargeTaxMinor = (0, calculations_1.roundHalfUp)((chargesMinor * input.chargesTaxRate) / 100);
        taxByCategory.standard = (taxByCategory.standard ?? 0) + (0, calculations_1.fromMinor)(chargeTaxMinor);
        taxMinor += chargeTaxMinor;
    }
    return {
        lines,
        lineSubtotal: (0, calculations_1.fromMinor)(lineSubtotalMinor),
        lineDiscountTotal: (0, calculations_1.fromMinor)(lineDiscountMinor),
        documentDiscount: (0, calculations_1.fromMinor)(docDiscountMinor),
        discountTotal: (0, calculations_1.fromMinor)(lineDiscountMinor + docDiscountMinor),
        shippingTotal: (0, calculations_1.fromMinor)(shippingMinor),
        packagingTotal: (0, calculations_1.fromMinor)(packagingMinor),
        otherChargesTotal: (0, calculations_1.fromMinor)(otherMinor),
        chargesTotal: (0, calculations_1.fromMinor)(chargesMinor),
        netSubtotal: (0, calculations_1.fromMinor)(netMinor),
        taxByCategory,
        taxTotal: (0, calculations_1.fromMinor)(taxMinor),
        grandTotal: (0, calculations_1.fromMinor)(netMinor + taxMinor),
        hasUnknownTax: lines.some(l => l.unknownTax),
    };
}
function evaluatePoApproval(calc, ctx) {
    const reasons = [];
    let blocked = false;
    if (calc.hasUnknownTax) {
        blocked = true;
        reasons.push('One or more lines have unknown supplier tax treatment — confirm the tax category before issue.');
    }
    if (calc.lines.length === 0) {
        blocked = true;
        reasons.push('The purchase order has no lines.');
    }
    if (ctx.valueThreshold != null && calc.grandTotal > ctx.valueThreshold) {
        reasons.push(`PO total ${calc.grandTotal.toFixed(2)} exceeds the configured approval threshold (${ctx.valueThreshold}).`);
    }
    if (ctx.freightThreshold != null && calc.chargesTotal > ctx.freightThreshold) {
        reasons.push(`Freight/charges ${calc.chargesTotal.toFixed(2)} exceed the configured threshold (${ctx.freightThreshold}).`);
    }
    if (!ctx.manufacturerActive)
        reasons.push('Manufacturer is marked inactive.');
    if (ctx.costDiffersFromAllocation)
        reasons.push('Supplier cost differs from the source allocation.');
    if (ctx.quantityDiffersFromAllocation)
        reasons.push('Quantity differs from the allocated sales-order quantity.');
    if (ctx.currencyDiffersFromDefault)
        reasons.push('Currency differs from the supplier default.');
    if (ctx.costOverridden)
        reasons.push('Supplier cost was manually overridden.');
    if (ctx.marginAtRisk)
        reasons.push('Margin at risk: supplier commitment reduces the client-order margin below configured thresholds.');
    // Blocked conditions stand alone; any other reason requires approval.
    const required = blocked || reasons.length > 0;
    return { required, blocked, reasons };
}
function analyseMarginAtRisk(input) {
    const sell = (0, calculations_1.toMinor)(input.clientNetSelling);
    const orig = (0, calculations_1.toMinor)(input.originalExpectedCost);
    const curr = (0, calculations_1.toMinor)(input.currentPoCost);
    const profit = sell - curr;
    const margin = sell > 0 ? (profit / sell) * 100 : null;
    const originalMargin = sell > 0 ? ((sell - orig) / sell) * 100 : null;
    let level = 'none';
    if (margin !== null) {
        if (margin < input.marginUltraBelow)
            level = 'ultra';
        else if (margin < input.marginCommercialBelow)
            level = 'commercial';
    }
    // Only flag "at risk" when the supplier cost INCREASED the risk (i.e. the
    // PO cost exceeds the original expectation) or margin sits below thresholds.
    const atRisk = level !== 'none' && curr > orig;
    return {
        clientNetSelling: (0, calculations_1.fromMinor)(sell),
        originalExpectedCost: (0, calculations_1.fromMinor)(orig),
        currentPoCost: (0, calculations_1.fromMinor)(curr),
        costVariance: (0, calculations_1.fromMinor)(curr - orig),
        expectedGrossProfit: (0, calculations_1.fromMinor)(profit),
        expectedMarginPercent: margin,
        originalMarginPercent: originalMargin,
        marginChangePercent: margin !== null && originalMargin !== null ? margin - originalMargin : null,
        atRisk: atRisk || (level !== 'none' && curr > orig),
        level: curr > orig ? level : 'none',
    };
}
// ── Supplier-safe output guard ───────────────────────────────
/** Field names that must NEVER appear in supplier-facing payloads. */
exports.SUPPLIER_FORBIDDEN_FIELDS = [
    'selling_price_unit', 'unit_price', 'line_net_total_client', 'markup', 'margin',
    'marginPercent', 'markupPercent', 'pricing_percent', 'procurement_fee',
    'deposit', 'client_discount', 'effectiveMarginPercent', 'effectiveMarkupPercent',
    'margin_analysis', 'internal_notes',
];
/** Deep-scan an object for forbidden client-side commercial fields. */
function findForbiddenSupplierFields(obj, path = '') {
    const hits = [];
    if (obj === null || typeof obj !== 'object')
        return hits;
    for (const [k, v] of Object.entries(obj)) {
        const p = path ? `${path}.${k}` : k;
        if (exports.SUPPLIER_FORBIDDEN_FIELDS.includes(k))
            hits.push(p);
        if (v && typeof v === 'object')
            hits.push(...findForbiddenSupplierFields(v, p));
    }
    return hits;
}
