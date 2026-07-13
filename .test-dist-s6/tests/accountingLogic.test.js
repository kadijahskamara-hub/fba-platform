"use strict";
// ============================================================
// Accounting logic tests (Sprint 6). Node built-in test runner.
// Covers: period lock, refund validation + segregation, the
// reconciliation state machine, duplicate-invoice heuristics,
// number-gap detection, aged-debtors bucketing, VAT summary
// (accrual: invoices minus credit notes), CSV escaping with the
// formula-injection guard, and the four package adapters.
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const accountingLogic_1 = require("../lib/commercial/accountingLogic");
// ── Periods ─────────────────────────────────────────────────
(0, node_test_1.test)('dateInRange is inclusive; rangesOverlap detects touching ranges', () => {
    strict_1.default.equal((0, accountingLogic_1.dateInRange)('2026-02-15', '2026-01-01', '2026-03-31'), true);
    strict_1.default.equal((0, accountingLogic_1.dateInRange)('2026-04-01', '2026-01-01', '2026-03-31'), false);
    strict_1.default.equal((0, accountingLogic_1.rangesOverlap)('2026-01-01', '2026-03-31', '2026-03-31', '2026-06-30'), true);
    strict_1.default.equal((0, accountingLogic_1.rangesOverlap)('2026-01-01', '2026-03-31', '2026-04-01', '2026-06-30'), false);
});
(0, node_test_1.test)('isDateLocked only counts closed periods', () => {
    const periods = [
        { starts_on: '2026-01-01', ends_on: '2026-03-31', status: 'closed' },
        { starts_on: '2026-04-01', ends_on: '2026-06-30', status: 'open' },
    ];
    strict_1.default.equal((0, accountingLogic_1.isDateLocked)('2026-02-10', periods), true);
    strict_1.default.equal((0, accountingLogic_1.isDateLocked)('2026-05-10', periods), false);
    strict_1.default.equal((0, accountingLogic_1.isDateLocked)(null, periods), false);
});
// ── Refund validation & segregation ─────────────────────────
(0, node_test_1.test)('refund must have a source, be positive, and within the ceiling', () => {
    strict_1.default.equal((0, accountingLogic_1.validateRefund)({ source: null, amount: 10, available: 100 }).ok, false);
    strict_1.default.equal((0, accountingLogic_1.validateRefund)({ source: 'payment', amount: 0, available: 100 }).ok, false);
    strict_1.default.equal((0, accountingLogic_1.validateRefund)({ source: 'payment', amount: 150, available: 100 }).ok, false);
    strict_1.default.equal((0, accountingLogic_1.validateRefund)({ source: 'payment', amount: 100, available: 100 }).ok, true);
    strict_1.default.equal((0, accountingLogic_1.validateRefund)({ source: 'credit_note', amount: 50, available: 100 }).ok, true);
});
(0, node_test_1.test)('a recorder cannot approve their own refund (segregation)', () => {
    strict_1.default.equal((0, accountingLogic_1.validateRefund)({ source: 'payment', amount: 10, available: 100, recordedBy: 'u1', approver: 'u1' }).ok, false);
    strict_1.default.equal((0, accountingLogic_1.validateRefund)({ source: 'payment', amount: 10, available: 100, recordedBy: 'u1', approver: 'u2' }).ok, true);
});
// ── Reconciliation state machine ────────────────────────────
(0, node_test_1.test)('reconciliation transitions', () => {
    strict_1.default.equal((0, accountingLogic_1.nextReconciliationState)('not_exported', 'export'), 'exported');
    strict_1.default.equal((0, accountingLogic_1.nextReconciliationState)('exported', 'reconcile'), 'reconciled');
    strict_1.default.equal((0, accountingLogic_1.nextReconciliationState)('reconciled', 'mutate'), 'needs_re_export');
    strict_1.default.equal((0, accountingLogic_1.nextReconciliationState)('exported', 'mutate'), 'needs_re_export');
    strict_1.default.equal((0, accountingLogic_1.nextReconciliationState)('not_exported', 'mutate'), 'not_exported');
    strict_1.default.equal((0, accountingLogic_1.nextReconciliationState)('excluded', 'export'), 'excluded');
    strict_1.default.equal((0, accountingLogic_1.nextReconciliationState)('anything', 'reset'), 'not_exported');
});
(0, node_test_1.test)('deriveNeedsReExport only for exported/reconciled', () => {
    strict_1.default.equal((0, accountingLogic_1.deriveNeedsReExport)('exported'), true);
    strict_1.default.equal((0, accountingLogic_1.deriveNeedsReExport)('reconciled'), true);
    strict_1.default.equal((0, accountingLogic_1.deriveNeedsReExport)('not_exported'), false);
});
// ── Duplicate warnings & number gaps ────────────────────────
(0, node_test_1.test)('duplicate warnings flag same source, near-duplicate, and same ref', () => {
    const existing = [
        { id: 'a', client_id: 'c1', gross_total: 1200, issue_date: '2026-07-01', source_proforma_id: 'p1', source_revision: 1, invoice_type: 'deposit', external_reference: 'PO-99', status: 'issued' },
    ];
    const cand = { id: 'b', client_id: 'c1', gross_total: 1200, issue_date: '2026-07-03', source_proforma_id: 'p1', source_revision: 1, invoice_type: 'deposit', external_reference: 'PO-99' };
    const w = (0, accountingLogic_1.duplicateInvoiceWarnings)(cand, existing);
    strict_1.default.equal(w.length, 3);
});
(0, node_test_1.test)('void invoices are ignored by duplicate warnings', () => {
    const existing = [{ id: 'a', client_id: 'c1', gross_total: 1200, issue_date: '2026-07-01', external_reference: 'PO-99', status: 'void' }];
    const cand = { id: 'b', client_id: 'c1', gross_total: 1200, issue_date: '2026-07-02', external_reference: 'PO-99' };
    strict_1.default.deepEqual((0, accountingLogic_1.duplicateInvoiceWarnings)(cand, existing), []);
});
(0, node_test_1.test)('findNumberGaps finds missing sequence integers', () => {
    strict_1.default.deepEqual((0, accountingLogic_1.findNumberGaps)(['FBA-INV-2026-0001', 'FBA-INV-2026-0002', 'FBA-INV-2026-0005']), [3, 4]);
    strict_1.default.deepEqual((0, accountingLogic_1.findNumberGaps)(['FBA-INV-2026-0007', 'FBA-INV-2026-0008']), []);
});
// ── Aged debtors ────────────────────────────────────────────
(0, node_test_1.test)('aged debtors buckets by overdue days', () => {
    const asOf = '2026-07-13';
    const b = (0, accountingLogic_1.agedDebtorBuckets)([
        { balance_due: 100, due_date: '2026-07-20' }, // not due -> current
        { balance_due: 200, due_date: '2026-07-01' }, // 12 days -> 1-30
        { balance_due: 300, due_date: '2026-06-01' }, // 42 days -> 31-60
        { balance_due: 400, due_date: '2026-05-01' }, // 73 days -> 61-90
        { balance_due: 500, due_date: '2026-01-01' }, // >90
        { balance_due: 0, due_date: '2026-01-01' }, // ignored
    ], asOf);
    strict_1.default.equal(b.current, 100);
    strict_1.default.equal(b.d1_30, 200);
    strict_1.default.equal(b.d31_60, 300);
    strict_1.default.equal(b.d61_90, 400);
    strict_1.default.equal(b.d90_plus, 500);
    strict_1.default.equal(b.total, 1500);
});
// ── VAT summary (accrual) ───────────────────────────────────
(0, node_test_1.test)('VAT summary nets invoices against credit notes by category', () => {
    const inv = [
        { taxCategory: 'standard', net: 1000, vat: 200 },
        { taxCategory: 'zero', net: 500, vat: 0 },
    ];
    const cn = [{ taxCategory: 'standard', net: 100, vat: 20 }];
    const s = (0, accountingLogic_1.vatSummary)(inv, cn);
    strict_1.default.equal(s.standard.net, 900);
    strict_1.default.equal(s.standard.vat, 180);
    strict_1.default.equal(s.zero.net, 500);
    const t = (0, accountingLogic_1.vatTotals)(s);
    strict_1.default.equal(t.net, 1400);
    strict_1.default.equal(t.vat, 180);
});
(0, node_test_1.test)('emptyVatSummary has all five categories at zero', () => {
    const s = (0, accountingLogic_1.emptyVatSummary)();
    strict_1.default.equal(Object.keys(s).length, 5);
    strict_1.default.equal(s.exempt.vat, 0);
});
// ── CSV escaping + formula-injection guard ──────────────────
(0, node_test_1.test)('csvCell quotes commas/quotes/newlines and neutralises formulas', () => {
    strict_1.default.equal((0, accountingLogic_1.csvCell)('plain'), 'plain');
    strict_1.default.equal((0, accountingLogic_1.csvCell)('a,b'), '"a,b"');
    strict_1.default.equal((0, accountingLogic_1.csvCell)('she said "hi"'), '"she said ""hi"""');
    strict_1.default.equal((0, accountingLogic_1.csvCell)('=1+1'), "'=1+1");
    strict_1.default.equal((0, accountingLogic_1.csvCell)('+44 7'), "'+44 7");
    strict_1.default.equal((0, accountingLogic_1.csvCell)('-5'), "'-5");
    strict_1.default.equal((0, accountingLogic_1.csvCell)('@handle'), "'@handle");
});
(0, node_test_1.test)('toCsv joins with CRLF and a trailing newline', () => {
    const csv = (0, accountingLogic_1.toCsv)(['A', 'B'], [[1, 2], ['x,y', 'z']]);
    strict_1.default.equal(csv, 'A,B\r\n1,2\r\n"x,y",z\r\n');
});
// ── Adapters ────────────────────────────────────────────────
const MAPPING = {
    sales_account: '200', debtors_account: '610', rounding_account: '860', bank_account: '090',
    vat_codes: {
        standard: { code: 'OUTPUT2', rate: 20 }, reduced: { code: 'RROUTPUT', rate: 5 },
        zero: { code: 'ZERORATEDOUTPUT', rate: 0 }, exempt: { code: 'EXEMPTOUTPUT', rate: 0 },
        outside_scope: { code: 'NONE', rate: 0 },
    },
};
const INVOICE = {
    kind: 'invoice', number: 'FBA-INV-2026-0007', date: '2026-07-01', dueDate: '2026-07-31',
    contact: 'Ms Client', currency: 'GBP',
    lines: [{ description: 'Oak table', taxCategory: 'standard', net: 1000, vat: 200 }],
};
const CREDIT = {
    kind: 'credit_note', number: 'FBA-CN-2026-0002', date: '2026-07-05', contact: 'Ms Client', currency: 'GBP',
    lines: [{ description: 'Return', taxCategory: 'standard', net: 100, vat: 20 }],
};
(0, node_test_1.test)('Xero adapter emits documented columns and maps tax codes', () => {
    const f = (0, accountingLogic_1.buildDocCsv)('xero', [INVOICE], MAPPING);
    strict_1.default.deepEqual(f.header, ['ContactName', 'InvoiceNumber', 'InvoiceDate', 'DueDate', 'Description', 'Quantity', 'UnitAmount', 'AccountCode', 'TaxType', 'Currency']);
    strict_1.default.deepEqual(f.rows[0], ['Ms Client', 'FBA-INV-2026-0007', '2026-07-01', '2026-07-31', 'Oak table', 1, 1000, '200', 'OUTPUT2', 'GBP']);
});
(0, node_test_1.test)('credit notes carry a negative net in the generic adapter', () => {
    const f = (0, accountingLogic_1.buildDocCsv)('generic', [CREDIT], MAPPING);
    const row = f.rows[0];
    // Net column index 9, Gross index 11 in the generic header
    strict_1.default.equal(row[9], -100);
    strict_1.default.equal(row[11], -120);
});
(0, node_test_1.test)('QuickBooks and Sage adapters produce their own headers', () => {
    strict_1.default.equal((0, accountingLogic_1.buildDocCsv)('quickbooks', [INVOICE], MAPPING).header[0], 'InvoiceNo');
    const sage = (0, accountingLogic_1.buildDocCsv)('sage', [CREDIT], MAPPING);
    strict_1.default.equal(sage.header[0], 'Type');
    strict_1.default.equal(sage.rows[0][0], 'SC'); // credit note = SC
    strict_1.default.equal(sage.rows[0][6], 100); // Sage NetAmount positive under SC
});
(0, node_test_1.test)('cash CSV negates refunds', () => {
    const f = (0, accountingLogic_1.buildCashCsv)([
        { kind: 'payment', number: 'PAY1', date: '2026-07-02', contact: 'Ms Client', currency: 'GBP', amount: 500, method: 'bank_transfer' },
        { kind: 'refund', number: 'FBA-RFD-2026-0001', date: '2026-07-06', contact: 'Ms Client', currency: 'GBP', amount: 120, method: 'bank_transfer' },
    ]);
    strict_1.default.equal(f.rows[0][7], 500);
    strict_1.default.equal(f.rows[1][7], -120);
});
