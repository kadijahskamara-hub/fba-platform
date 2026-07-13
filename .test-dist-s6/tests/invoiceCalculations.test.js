"use strict";
// ============================================================
// Client invoice calculation tests (Sprint 3, spec §21).
// Node built-in test runner: npm test
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const invoiceCalculations_1 = require("../lib/commercial/invoiceCalculations");
// Invoice totals reconcile
(0, node_test_1.test)('invoice totals reconcile: net + VAT = gross', () => {
    const r = (0, invoiceCalculations_1.calculateInvoice)({
        vatRegistered: true,
        lines: [
            { quantity: 2, unitPrice: 100, discountAmount: 10, taxCategory: 'standard', taxRate: 20 },
            { quantity: 1, unitPrice: 50, discountAmount: 0, taxCategory: 'zero', taxRate: null },
        ],
    });
    // net: (200-10) + 50 = 240; VAT: 20% of 190 = 38
    strict_1.default.equal(r.subtotal, 240);
    strict_1.default.equal(r.taxByCategory.standard, 38);
    strict_1.default.equal(r.taxTotal, 38);
    strict_1.default.equal(r.grossTotal, 278);
    strict_1.default.ok(Math.abs((r.subtotal + r.taxTotal) - r.grossTotal) < 0.005);
});
(0, node_test_1.test)('VAT-unregistered invoices apply no VAT', () => {
    const r = (0, invoiceCalculations_1.calculateInvoice)({
        vatRegistered: false,
        lines: [{ quantity: 1, unitPrice: 100, discountAmount: 0, taxCategory: 'standard', taxRate: 20 }],
    });
    strict_1.default.equal(r.taxTotal, 0);
    strict_1.default.equal(r.grossTotal, 100);
});
// 5. Deposit invoice uses configured basis
(0, node_test_1.test)('deposit uses configured basis and percent', () => {
    const gross = 1200, net = 1000;
    strict_1.default.equal((0, invoiceCalculations_1.calculateDeposit)({ netSubtotal: net, grossTotal: gross, depositPercent: 25, basis: 'gross_total' }), 300);
    strict_1.default.equal((0, invoiceCalculations_1.calculateDeposit)({ netSubtotal: net, grossTotal: gross, depositPercent: 25, basis: 'net_subtotal' }), 250);
    // authorised override wins
    strict_1.default.equal((0, invoiceCalculations_1.calculateDeposit)({ netSubtotal: net, grossTotal: gross, depositPercent: 25, basis: 'gross_total', override: 400 }), 400);
});
// 6. Stage invoice cannot exceed remaining invoiceable value
(0, node_test_1.test)('stage invoice cannot exceed remaining invoiceable value', () => {
    const state = { orderGross: 1000, approvedVariations: 0, priorInvoiced: 600, creditNotes: 0 };
    strict_1.default.equal((0, invoiceCalculations_1.remainingInvoiceable)(state), 400);
    strict_1.default.equal((0, invoiceCalculations_1.assertInvoiceable)(400, state).ok, true);
    const over = (0, invoiceCalculations_1.assertInvoiceable)(401, state);
    strict_1.default.equal(over.ok, false);
    strict_1.default.ok(over.error && over.error.includes('exceeds'));
});
// 7. Final invoice reconciles prior invoices and credits
(0, node_test_1.test)('final invoice remaining = order + variations − prior invoices − credits', () => {
    const state = { orderGross: 1000, approvedVariations: 150, priorInvoiced: 300, creditNotes: 50 };
    // 1000 + 150 - 300 - 50 = 800
    strict_1.default.equal((0, invoiceCalculations_1.remainingInvoiceable)(state), 800);
});
// 8. Over-invoicing is blocked
(0, node_test_1.test)('over-invoicing beyond remaining is blocked', () => {
    const state = { orderGross: 500, approvedVariations: 0, priorInvoiced: 500, creditNotes: 0 };
    strict_1.default.equal((0, invoiceCalculations_1.remainingInvoiceable)(state), 0);
    strict_1.default.equal((0, invoiceCalculations_1.assertInvoiceable)(0.01, state).ok, false);
});
// 11. Payment allocation cannot exceed payment balance
(0, node_test_1.test)('payment allocation cannot exceed unallocated payment balance', () => {
    const r = (0, invoiceCalculations_1.checkPaymentAllocation)({
        paymentCurrency: 'GBP', invoiceCurrency: 'GBP',
        paymentAmount: 500, alreadyAllocatedOnPayment: 400, invoiceOutstanding: 1000, requested: 200,
    });
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.error && r.error.includes('payment balance'));
});
// 12. Payment allocation cannot exceed invoice balance
(0, node_test_1.test)('payment allocation cannot exceed invoice outstanding', () => {
    const r = (0, invoiceCalculations_1.checkPaymentAllocation)({
        paymentCurrency: 'GBP', invoiceCurrency: 'GBP',
        paymentAmount: 1000, alreadyAllocatedOnPayment: 0, invoiceOutstanding: 150, requested: 200,
    });
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.error && r.error.includes('invoice outstanding'));
});
// 13. Currency mismatch is blocked
(0, node_test_1.test)('currency mismatch blocks allocation', () => {
    const r = (0, invoiceCalculations_1.checkPaymentAllocation)({
        paymentCurrency: 'USD', invoiceCurrency: 'GBP',
        paymentAmount: 1000, alreadyAllocatedOnPayment: 0, invoiceOutstanding: 1000, requested: 100,
    });
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.error && r.error.includes('Currency'));
});
(0, node_test_1.test)('valid allocation within both balances is accepted', () => {
    const r = (0, invoiceCalculations_1.checkPaymentAllocation)({
        paymentCurrency: 'GBP', invoiceCurrency: 'GBP',
        paymentAmount: 500, alreadyAllocatedOnPayment: 100, invoiceOutstanding: 1000, requested: 300,
    });
    strict_1.default.equal(r.ok, true);
});
// 15. Invoice paid status derives from allocations
(0, node_test_1.test)('invoice paid status derives from allocations', () => {
    strict_1.default.equal((0, invoiceCalculations_1.deriveInvoiceStatus)({ grossTotal: 1000, amountPaid: 1000, creditTotal: 0, dueDate: '2026-01-01' }), 'paid');
    strict_1.default.equal((0, invoiceCalculations_1.invoiceBalance)(1000, 1000, 0), 0);
});
// 16. Partial payment produces partially-paid status
(0, node_test_1.test)('partial payment produces partially_paid', () => {
    strict_1.default.equal((0, invoiceCalculations_1.deriveInvoiceStatus)({ grossTotal: 1000, amountPaid: 400, creditTotal: 0, dueDate: '2999-01-01' }), 'partially_paid');
    strict_1.default.equal((0, invoiceCalculations_1.invoiceBalance)(1000, 400, 0), 600);
});
// credit fully settling an invoice → credited
(0, node_test_1.test)('invoice fully settled by credit note → credited', () => {
    strict_1.default.equal((0, invoiceCalculations_1.deriveInvoiceStatus)({ grossTotal: 500, amountPaid: 0, creditTotal: 500, dueDate: '2026-01-01' }), 'credited');
});
// 17. Overdue status derives correctly (and paid never overdue)
(0, node_test_1.test)('overdue derives from due date; paid invoices are never overdue', () => {
    strict_1.default.equal((0, invoiceCalculations_1.isOverdue)({ locked: true, balanceDue: 200, dueDate: '2020-01-01', today: '2026-07-12' }), true);
    strict_1.default.equal((0, invoiceCalculations_1.isOverdue)({ locked: true, balanceDue: 0, dueDate: '2020-01-01', today: '2026-07-12' }), false);
    strict_1.default.equal((0, invoiceCalculations_1.isOverdue)({ locked: false, balanceDue: 200, dueDate: '2020-01-01', today: '2026-07-12' }), false);
    strict_1.default.equal((0, invoiceCalculations_1.deriveInvoiceStatus)({ grossTotal: 1000, amountPaid: 0, creditTotal: 0, dueDate: '2020-01-01', today: '2026-07-12' }), 'overdue');
});
// 20. Credit note cannot exceed eligible invoice amount
(0, node_test_1.test)('credit note cannot exceed eligible invoice amount', () => {
    strict_1.default.equal((0, invoiceCalculations_1.checkCreditNoteAmount)({ creditNoteGross: 300, eligibleInvoiceAmount: 250 }).ok, false);
    strict_1.default.equal((0, invoiceCalculations_1.checkCreditNoteAmount)({ creditNoteGross: 250, eligibleInvoiceAmount: 250 }).ok, true);
});
// 21. Client documents exclude supplier cost and margin
(0, node_test_1.test)('client invoice payload scanner catches supplier cost and margin fields', () => {
    const safe = {
        invoice_number: 'FBA-INV-2026-0001',
        lines: [{ name_snapshot: 'Chair', unit_price: 300, quantity: 2, line_net_total: 600 }],
        totals: { subtotal: 600, tax_total: 120, gross_total: 720 },
    };
    strict_1.default.deepEqual((0, invoiceCalculations_1.findForbiddenClientInvoiceFields)(safe), []);
    const leaky = {
        lines: [{ name_snapshot: 'Chair', unit_price: 300, supplier_cost_unit: 150 }],
        analysis: { marginPercent: 50 },
    };
    const hits = (0, invoiceCalculations_1.findForbiddenClientInvoiceFields)(leaky);
    strict_1.default.ok(hits.some(h => h.includes('supplier_cost_unit')));
    strict_1.default.ok(hits.some(h => h.includes('marginPercent')));
});
// Line discount caps at subtotal
(0, node_test_1.test)('invoice line discount caps at the line subtotal', () => {
    const l = (0, invoiceCalculations_1.calculateInvoiceLine)({ quantity: 1, unitPrice: 100, discountAmount: 150, taxCategory: 'standard', taxRate: 20 });
    strict_1.default.equal(l.discountAmount, 100);
    strict_1.default.equal(l.lineNetTotal, 0);
    strict_1.default.equal(l.lineTaxTotal, 0);
});
