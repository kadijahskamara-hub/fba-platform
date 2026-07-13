"use strict";
// ============================================================
// Client-side invoice calculation engine (Sprint 3).
//
// Pure module (no server imports) reusing the Sprint 1 minor-unit
// money utilities. Client invoices carry SELLING prices only —
// supplier cost, FBA markup and margin never appear here. Server
// calculations are authoritative; browser-submitted totals that do
// not reconcile are rejected by the caller.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLIENT_INVOICE_FORBIDDEN_FIELDS = void 0;
exports.calculateInvoiceLine = calculateInvoiceLine;
exports.calculateInvoice = calculateInvoice;
exports.invoiceBalance = invoiceBalance;
exports.deriveInvoiceStatus = deriveInvoiceStatus;
exports.isOverdue = isOverdue;
exports.calculateDeposit = calculateDeposit;
exports.remainingInvoiceable = remainingInvoiceable;
exports.assertInvoiceable = assertInvoiceable;
exports.checkPaymentAllocation = checkPaymentAllocation;
exports.checkCreditNoteAmount = checkCreditNoteAmount;
exports.findForbiddenClientInvoiceFields = findForbiddenClientInvoiceFields;
const calculations_1 = require("./calculations");
function invoiceTaxRateFor(category, rate) {
    return (category === 'standard' || category === 'reduced') ? (rate ?? 0) : 0;
}
function calculateInvoiceLine(input) {
    const qty = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 0;
    const priceMinor = (0, calculations_1.toMinor)(input.unitPrice);
    const subtotalMinor = (0, calculations_1.roundHalfUp)(priceMinor * qty);
    const discountMinor = Math.min(Math.max((0, calculations_1.toMinor)(input.discountAmount ?? 0), 0), subtotalMinor);
    const netMinor = subtotalMinor - discountMinor;
    const rate = invoiceTaxRateFor(input.taxCategory, input.taxRate);
    const taxMinor = (0, calculations_1.roundHalfUp)((netMinor * rate) / 100);
    return {
        id: input.id,
        quantity: qty,
        unitPrice: (0, calculations_1.fromMinor)(priceMinor),
        lineSubtotal: (0, calculations_1.fromMinor)(subtotalMinor),
        discountAmount: (0, calculations_1.fromMinor)(discountMinor),
        lineNetTotal: (0, calculations_1.fromMinor)(netMinor),
        taxCategory: input.taxCategory,
        taxRate: rate,
        lineTaxTotal: (0, calculations_1.fromMinor)(taxMinor),
        lineGrossTotal: (0, calculations_1.fromMinor)(netMinor + taxMinor),
    };
}
function calculateInvoice(input) {
    const lines = input.lines.map(calculateInvoiceLine);
    const netMinor = lines.reduce((s, l) => s + (0, calculations_1.toMinor)(l.lineNetTotal), 0);
    const taxByCategory = {};
    let taxMinor = 0;
    if (input.vatRegistered) {
        for (const l of lines) {
            const m = (0, calculations_1.toMinor)(l.lineTaxTotal);
            if (m !== 0)
                taxByCategory[l.taxCategory] = (taxByCategory[l.taxCategory] ?? 0) + (0, calculations_1.fromMinor)(m);
            taxMinor += m;
        }
    }
    return {
        lines,
        subtotal: (0, calculations_1.fromMinor)(netMinor),
        taxByCategory,
        taxTotal: (0, calculations_1.fromMinor)(taxMinor),
        grossTotal: (0, calculations_1.fromMinor)(netMinor + taxMinor),
    };
}
// ── Balances, status, overdue (pure mirrors of the SQL) ──────
/** Outstanding balance = gross − confirmed payments − allocated credits. */
function invoiceBalance(grossTotal, amountPaid, creditTotal) {
    return (0, calculations_1.fromMinor)((0, calculations_1.toMinor)(grossTotal) - (0, calculations_1.toMinor)(amountPaid) - (0, calculations_1.toMinor)(creditTotal));
}
/** Derive the money-status of an ISSUED invoice from its allocations. */
function deriveInvoiceStatus(params) {
    const balance = invoiceBalance(params.grossTotal, params.amountPaid, params.creditTotal);
    if (balance <= 0 && params.grossTotal > 0) {
        return (params.creditTotal > 0 && params.amountPaid === 0) ? 'credited' : 'paid';
    }
    if (params.amountPaid > 0 || params.creditTotal > 0)
        return 'partially_paid';
    if (isOverdue({ locked: true, balanceDue: balance, dueDate: params.dueDate, today: params.today }))
        return 'overdue';
    return 'issued';
}
/** Overdue iff issued, balance owing, and due date has passed. Paid invoices are never overdue. */
function isOverdue(params) {
    if (!params.locked)
        return false;
    if (params.balanceDue <= 0)
        return false;
    if (!params.dueDate)
        return false;
    const today = params.today ?? new Date().toISOString().slice(0, 10);
    return params.dueDate < today;
}
// ── Deposit calculation ──────────────────────────────────────
function calculateDeposit(params) {
    if (params.override != null && Number.isFinite(params.override) && params.override >= 0) {
        return (0, calculations_1.fromMinor)((0, calculations_1.toMinor)(params.override));
    }
    const baseMinor = params.basis === 'net_subtotal' ? (0, calculations_1.toMinor)(params.netSubtotal) : (0, calculations_1.toMinor)(params.grossTotal);
    return (0, calculations_1.fromMinor)((0, calculations_1.roundHalfUp)((baseMinor * params.depositPercent) / 100));
}
/** accepted order gross + variations − prior invoices − credit notes. */
function remainingInvoiceable(s) {
    return (0, calculations_1.fromMinor)((0, calculations_1.toMinor)(s.orderGross) + (0, calculations_1.toMinor)(s.approvedVariations) - (0, calculations_1.toMinor)(s.priorInvoiced) - (0, calculations_1.toMinor)(s.creditNotes));
}
/** Guard: a new invoice of `requested` gross must not exceed the remaining invoiceable amount. */
function assertInvoiceable(requested, s) {
    const remaining = remainingInvoiceable(s);
    if ((0, calculations_1.toMinor)(requested) > (0, calculations_1.toMinor)(remaining)) {
        return { ok: false, remaining, error: `Invoice of ${requested.toFixed(2)} exceeds the remaining invoiceable amount (${remaining.toFixed(2)}).` };
    }
    return { ok: true, remaining };
}
// ── Allocation caps (pure mirrors of the atomic SQL functions) ──
function checkPaymentAllocation(params) {
    if (params.requested <= 0)
        return { ok: false, error: 'Allocation amount must be positive.' };
    if (params.paymentCurrency !== params.invoiceCurrency)
        return { ok: false, error: 'Currency mismatch between payment and invoice.' };
    const free = (0, calculations_1.toMinor)(params.paymentAmount) - (0, calculations_1.toMinor)(params.alreadyAllocatedOnPayment);
    if ((0, calculations_1.toMinor)(params.requested) > free)
        return { ok: false, error: 'Allocation exceeds the unallocated payment balance.' };
    if ((0, calculations_1.toMinor)(params.requested) > (0, calculations_1.toMinor)(params.invoiceOutstanding))
        return { ok: false, error: 'Allocation exceeds the invoice outstanding balance.' };
    return { ok: true };
}
function checkCreditNoteAmount(params) {
    if ((0, calculations_1.toMinor)(params.creditNoteGross) > (0, calculations_1.toMinor)(params.eligibleInvoiceAmount)) {
        return { ok: false, error: 'Credit note exceeds the eligible invoice amount.' };
    }
    return { ok: true };
}
// ── Client-safe output guard ─────────────────────────────────
/** Field names that must NEVER appear in a client invoice/statement payload. */
exports.CLIENT_INVOICE_FORBIDDEN_FIELDS = [
    'supplier_cost', 'supplier_cost_unit', 'supplier_cost_total', 'line_cost_total',
    'markup', 'markupPercent', 'pricing_percent', 'margin', 'marginPercent',
    'effectiveMarginPercent', 'effectiveMarkupPercent', 'fba_margin', 'margin_analysis',
];
function findForbiddenClientInvoiceFields(obj, path = '') {
    const hits = [];
    if (obj === null || typeof obj !== 'object')
        return hits;
    for (const [k, v] of Object.entries(obj)) {
        const p = path ? `${path}.${k}` : k;
        if (exports.CLIENT_INVOICE_FORBIDDEN_FIELDS.includes(k))
            hits.push(p);
        if (v && typeof v === 'object')
            hits.push(...findForbiddenClientInvoiceFields(v, p));
    }
    return hits;
}
