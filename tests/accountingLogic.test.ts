// ============================================================
// Accounting logic tests (Sprint 6). Node built-in test runner.
// Covers: period lock, refund validation + segregation, the
// reconciliation state machine, duplicate-invoice heuristics,
// number-gap detection, aged-debtors bucketing, VAT summary
// (accrual: invoices minus credit notes), CSV escaping with the
// formula-injection guard, and the four package adapters.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dateInRange, rangesOverlap, isDateLocked,
  validateRefund, nextReconciliationState, deriveNeedsReExport,
  duplicateInvoiceWarnings, findNumberGaps, agedDebtorBuckets,
  vatSummary, vatTotals, emptyVatSummary,
  csvCell, toCsv, buildDocCsv, buildCashCsv,
  type AccountMapping, type ExportDoc, type PeriodLike,
} from '../lib/commercial/accountingLogic'

// ── Periods ─────────────────────────────────────────────────

test('dateInRange is inclusive; rangesOverlap detects touching ranges', () => {
  assert.equal(dateInRange('2026-02-15', '2026-01-01', '2026-03-31'), true)
  assert.equal(dateInRange('2026-04-01', '2026-01-01', '2026-03-31'), false)
  assert.equal(rangesOverlap('2026-01-01', '2026-03-31', '2026-03-31', '2026-06-30'), true)
  assert.equal(rangesOverlap('2026-01-01', '2026-03-31', '2026-04-01', '2026-06-30'), false)
})

test('isDateLocked only counts closed periods', () => {
  const periods: PeriodLike[] = [
    { starts_on: '2026-01-01', ends_on: '2026-03-31', status: 'closed' },
    { starts_on: '2026-04-01', ends_on: '2026-06-30', status: 'open' },
  ]
  assert.equal(isDateLocked('2026-02-10', periods), true)
  assert.equal(isDateLocked('2026-05-10', periods), false)
  assert.equal(isDateLocked(null, periods), false)
})

// ── Refund validation & segregation ─────────────────────────

test('refund must have a source, be positive, and within the ceiling', () => {
  assert.equal(validateRefund({ source: null, amount: 10, available: 100 }).ok, false)
  assert.equal(validateRefund({ source: 'payment', amount: 0, available: 100 }).ok, false)
  assert.equal(validateRefund({ source: 'payment', amount: 150, available: 100 }).ok, false)
  assert.equal(validateRefund({ source: 'payment', amount: 100, available: 100 }).ok, true)
  assert.equal(validateRefund({ source: 'credit_note', amount: 50, available: 100 }).ok, true)
})

test('a recorder cannot approve their own refund (segregation)', () => {
  assert.equal(validateRefund({ source: 'payment', amount: 10, available: 100, recordedBy: 'u1', approver: 'u1' }).ok, false)
  assert.equal(validateRefund({ source: 'payment', amount: 10, available: 100, recordedBy: 'u1', approver: 'u2' }).ok, true)
})

// ── Reconciliation state machine ────────────────────────────

test('reconciliation transitions', () => {
  assert.equal(nextReconciliationState('not_exported', 'export'), 'exported')
  assert.equal(nextReconciliationState('exported', 'reconcile'), 'reconciled')
  assert.equal(nextReconciliationState('reconciled', 'mutate'), 'needs_re_export')
  assert.equal(nextReconciliationState('exported', 'mutate'), 'needs_re_export')
  assert.equal(nextReconciliationState('not_exported', 'mutate'), 'not_exported')
  assert.equal(nextReconciliationState('excluded', 'export'), 'excluded')
  assert.equal(nextReconciliationState('anything' as never, 'reset'), 'not_exported')
})

test('deriveNeedsReExport only for exported/reconciled', () => {
  assert.equal(deriveNeedsReExport('exported'), true)
  assert.equal(deriveNeedsReExport('reconciled'), true)
  assert.equal(deriveNeedsReExport('not_exported'), false)
})

// ── Duplicate warnings & number gaps ────────────────────────

test('duplicate warnings flag same source, near-duplicate, and same ref', () => {
  const existing = [
    { id: 'a', client_id: 'c1', gross_total: 1200, issue_date: '2026-07-01', source_proforma_id: 'p1', source_revision: 1, invoice_type: 'deposit', external_reference: 'PO-99', status: 'issued' },
  ]
  const cand = { id: 'b', client_id: 'c1', gross_total: 1200, issue_date: '2026-07-03', source_proforma_id: 'p1', source_revision: 1, invoice_type: 'deposit', external_reference: 'PO-99' }
  const w = duplicateInvoiceWarnings(cand, existing)
  assert.equal(w.length, 3)
})

test('void invoices are ignored by duplicate warnings', () => {
  const existing = [{ id: 'a', client_id: 'c1', gross_total: 1200, issue_date: '2026-07-01', external_reference: 'PO-99', status: 'void' }]
  const cand = { id: 'b', client_id: 'c1', gross_total: 1200, issue_date: '2026-07-02', external_reference: 'PO-99' }
  assert.deepEqual(duplicateInvoiceWarnings(cand, existing), [])
})

test('findNumberGaps finds missing sequence integers', () => {
  assert.deepEqual(findNumberGaps(['FBA-INV-2026-0001', 'FBA-INV-2026-0002', 'FBA-INV-2026-0005']), [3, 4])
  assert.deepEqual(findNumberGaps(['FBA-INV-2026-0007', 'FBA-INV-2026-0008']), [])
})

// ── Aged debtors ────────────────────────────────────────────

test('aged debtors buckets by overdue days', () => {
  const asOf = '2026-07-13'
  const b = agedDebtorBuckets([
    { balance_due: 100, due_date: '2026-07-20' },   // not due -> current
    { balance_due: 200, due_date: '2026-07-01' },   // 12 days -> 1-30
    { balance_due: 300, due_date: '2026-06-01' },   // 42 days -> 31-60
    { balance_due: 400, due_date: '2026-05-01' },   // 73 days -> 61-90
    { balance_due: 500, due_date: '2026-01-01' },   // >90
    { balance_due: 0,   due_date: '2026-01-01' },   // ignored
  ], asOf)
  assert.equal(b.current, 100)
  assert.equal(b.d1_30, 200)
  assert.equal(b.d31_60, 300)
  assert.equal(b.d61_90, 400)
  assert.equal(b.d90_plus, 500)
  assert.equal(b.total, 1500)
})

// ── VAT summary (accrual) ───────────────────────────────────

test('VAT summary nets invoices against credit notes by category', () => {
  const inv = [
    { taxCategory: 'standard' as const, net: 1000, vat: 200 },
    { taxCategory: 'zero' as const, net: 500, vat: 0 },
  ]
  const cn = [{ taxCategory: 'standard' as const, net: 100, vat: 20 }]
  const s = vatSummary(inv, cn)
  assert.equal(s.standard.net, 900)
  assert.equal(s.standard.vat, 180)
  assert.equal(s.zero.net, 500)
  const t = vatTotals(s)
  assert.equal(t.net, 1400)
  assert.equal(t.vat, 180)
})

test('emptyVatSummary has all five categories at zero', () => {
  const s = emptyVatSummary()
  assert.equal(Object.keys(s).length, 5)
  assert.equal(s.exempt.vat, 0)
})

// ── CSV escaping + formula-injection guard ──────────────────

test('csvCell quotes commas/quotes/newlines and neutralises formulas', () => {
  assert.equal(csvCell('plain'), 'plain')
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('she said "hi"'), '"she said ""hi"""')
  assert.equal(csvCell('=1+1'), "'=1+1")
  assert.equal(csvCell('+44 7'), "'+44 7")
  assert.equal(csvCell('-5'), "'-5")
  assert.equal(csvCell('@handle'), "'@handle")
})

test('toCsv joins with CRLF and a trailing newline', () => {
  const csv = toCsv(['A', 'B'], [[1, 2], ['x,y', 'z']])
  assert.equal(csv, 'A,B\r\n1,2\r\n"x,y",z\r\n')
})

// ── Adapters ────────────────────────────────────────────────

const MAPPING: AccountMapping = {
  sales_account: '200', debtors_account: '610', rounding_account: '860', bank_account: '090',
  vat_codes: {
    standard: { code: 'OUTPUT2', rate: 20 }, reduced: { code: 'RROUTPUT', rate: 5 },
    zero: { code: 'ZERORATEDOUTPUT', rate: 0 }, exempt: { code: 'EXEMPTOUTPUT', rate: 0 },
    outside_scope: { code: 'NONE', rate: 0 },
  },
}
const INVOICE: ExportDoc = {
  kind: 'invoice', number: 'FBA-INV-2026-0007', date: '2026-07-01', dueDate: '2026-07-31',
  contact: 'Ms Client', currency: 'GBP',
  lines: [{ description: 'Oak table', taxCategory: 'standard', net: 1000, vat: 200 }],
}
const CREDIT: ExportDoc = {
  kind: 'credit_note', number: 'FBA-CN-2026-0002', date: '2026-07-05', contact: 'Ms Client', currency: 'GBP',
  lines: [{ description: 'Return', taxCategory: 'standard', net: 100, vat: 20 }],
}

test('Xero adapter emits documented columns and maps tax codes', () => {
  const f = buildDocCsv('xero', [INVOICE], MAPPING)
  assert.deepEqual(f.header, ['ContactName', 'InvoiceNumber', 'InvoiceDate', 'DueDate', 'Description', 'Quantity', 'UnitAmount', 'AccountCode', 'TaxType', 'Currency'])
  assert.deepEqual(f.rows[0], ['Ms Client', 'FBA-INV-2026-0007', '2026-07-01', '2026-07-31', 'Oak table', 1, 1000, '200', 'OUTPUT2', 'GBP'])
})

test('credit notes carry a negative net in the generic adapter', () => {
  const f = buildDocCsv('generic', [CREDIT], MAPPING)
  const row = f.rows[0]
  // Net column index 9, Gross index 11 in the generic header
  assert.equal(row[9], -100)
  assert.equal(row[11], -120)
})

test('QuickBooks and Sage adapters produce their own headers', () => {
  assert.equal(buildDocCsv('quickbooks', [INVOICE], MAPPING).header[0], 'InvoiceNo')
  const sage = buildDocCsv('sage', [CREDIT], MAPPING)
  assert.equal(sage.header[0], 'Type')
  assert.equal(sage.rows[0][0], 'SC')       // credit note = SC
  assert.equal(sage.rows[0][6], 100)        // Sage NetAmount positive under SC
})

test('cash CSV negates refunds', () => {
  const f = buildCashCsv([
    { kind: 'payment', number: 'PAY1', date: '2026-07-02', contact: 'Ms Client', currency: 'GBP', amount: 500, method: 'bank_transfer' },
    { kind: 'refund', number: 'FBA-RFD-2026-0001', date: '2026-07-06', contact: 'Ms Client', currency: 'GBP', amount: 120, method: 'bank_transfer' },
  ])
  assert.equal(f.rows[0][7], 500)
  assert.equal(f.rows[1][7], -120)
})
