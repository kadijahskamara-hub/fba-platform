"use strict";
// ============================================================
// Accounting — PURE logic (Sprint 6).
//
// No server-only imports: shared by API routes, the export/report
// server modules, and the unit tests (see tsconfig.test.json).
// Contains: period containment/overlap; refund validation (source,
// ceiling, segregation); reconciliation state machine; duplicate-
// invoice warning heuristics; aged-debtors bucketing; VAT summary
// aggregation (invoices minus credit notes, accrual basis); the
// canonical export row model + per-package (Xero / QuickBooks /
// Sage / generic) column mappers; and CSV escaping with a
// formula-injection guard.
//
// Money is handled as major-unit numbers already rounded upstream;
// helpers never re-round beyond 2dp presentation.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.TAX_CATEGORIES = void 0;
exports.dateInRange = dateInRange;
exports.rangesOverlap = rangesOverlap;
exports.isDateLocked = isDateLocked;
exports.validateRefund = validateRefund;
exports.nextReconciliationState = nextReconciliationState;
exports.deriveNeedsReExport = deriveNeedsReExport;
exports.duplicateInvoiceWarnings = duplicateInvoiceWarnings;
exports.findNumberGaps = findNumberGaps;
exports.agedDebtorBuckets = agedDebtorBuckets;
exports.emptyVatSummary = emptyVatSummary;
exports.vatSummary = vatSummary;
exports.vatTotals = vatTotals;
exports.csvCell = csvCell;
exports.toCsv = toCsv;
exports.buildDocCsv = buildDocCsv;
exports.buildCashCsv = buildCashCsv;
exports.TAX_CATEGORIES = ['standard', 'reduced', 'zero', 'exempt', 'outside_scope'];
// ── Dates & periods ─────────────────────────────────────────
/** Inclusive containment: is `d` within [start, end]? All ISO yyyy-mm-dd. */
function dateInRange(d, start, end) {
    return d >= start && d <= end;
}
/** Do two inclusive date ranges overlap at all? */
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart <= bEnd && bStart <= aEnd;
}
/** Is a tax-point date inside any CLOSED period? */
function isDateLocked(d, periods) {
    if (!d)
        return false;
    return periods.some(p => p.status === 'closed' && dateInRange(d, p.starts_on, p.ends_on));
}
function validateRefund(i) {
    if (i.source !== 'payment' && i.source !== 'credit_note')
        return { ok: false, error: 'A refund needs exactly one source (payment or credit note).' };
    if (!Number.isFinite(i.amount) || i.amount <= 0)
        return { ok: false, error: 'Refund amount must be greater than zero.' };
    if (i.amount > i.available + 0.005)
        return { ok: false, error: `Refund exceeds the available amount (${i.available.toFixed(2)}).` };
    if (i.approver && i.recordedBy && i.approver === i.recordedBy) {
        return { ok: false, error: 'Segregation of duties: you cannot approve a refund you recorded.' };
    }
    return { ok: true };
}
function nextReconciliationState(current, event) {
    switch (event) {
        case 'export': return current === 'excluded' ? 'excluded' : 'exported';
        case 'reconcile': return current === 'exported' || current === 'needs_re_export' ? 'reconciled' : current;
        case 'mutate': // a financial change after export invalidates the export
            return current === 'exported' || current === 'reconciled' ? 'needs_re_export' : current;
        case 'exclude': return 'excluded';
        case 'reset': return 'not_exported';
        default: return current;
    }
}
/** True when a mutation should flip an already-exported doc to needs_re_export. */
function deriveNeedsReExport(current) {
    return current === 'exported' || current === 'reconciled';
}
/** Non-blocking warnings at invoice creation (the hard block is the DB index). */
function duplicateInvoiceWarnings(candidate, existing) {
    const warns = [];
    const active = existing.filter(e => e.id !== candidate.id && e.status !== 'void' && e.status !== 'cancelled');
    // same source proforma + revision + type (also the DB uniqueness key)
    if (candidate.source_proforma_id) {
        const clash = active.find(e => e.source_proforma_id === candidate.source_proforma_id &&
            (e.source_revision ?? null) === (candidate.source_revision ?? null) &&
            (e.invoice_type ?? null) === (candidate.invoice_type ?? null));
        if (clash)
            warns.push('An invoice already exists for this proforma revision and type.');
    }
    // same client + same gross within 7 days
    if (candidate.client_id && candidate.issue_date) {
        const near = active.find(e => e.client_id === candidate.client_id &&
            Math.abs(e.gross_total - candidate.gross_total) < 0.005 &&
            e.issue_date != null && daysBetween(e.issue_date, candidate.issue_date) <= 7);
        if (near)
            warns.push('A similar invoice (same client, same total) was raised within the last 7 days.');
    }
    // same external reference
    if (candidate.external_reference) {
        const sameRef = active.find(e => (e.external_reference ?? '') === candidate.external_reference);
        if (sameRef)
            warns.push('Another invoice carries the same external reference.');
    }
    return warns;
}
function daysBetween(a, b) {
    const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime());
    return Math.round(ms / 86400000);
}
// ── Number-sequence gap report ──────────────────────────────
//
// Issued numbers must be continuous; voids stay visible but their
// numbers are never reused. Returns the missing sequence integers.
function findNumberGaps(numbers, prefixRe = /(\d+)\s*$/) {
    const seq = numbers.map(n => { const m = prefixRe.exec(n); return m ? parseInt(m[1], 10) : NaN; })
        .filter(n => Number.isFinite(n)).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < seq.length; i++) {
        for (let x = seq[i - 1] + 1; x < seq[i]; x++)
            gaps.push(x);
    }
    return gaps;
}
function agedDebtorBuckets(invoices, asOf) {
    const b = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
    for (const inv of invoices) {
        const bal = Number(inv.balance_due ?? 0);
        if (bal <= 0)
            continue;
        const ref = inv.due_date ?? inv.issue_date;
        const overdue = ref ? daysBetween(ref, asOf) * (ref <= asOf ? 1 : 0) : 0;
        if (!ref || ref > asOf || overdue === 0)
            b.current += bal;
        else if (overdue <= 30)
            b.d1_30 += bal;
        else if (overdue <= 60)
            b.d31_60 += bal;
        else if (overdue <= 90)
            b.d61_90 += bal;
        else
            b.d90_plus += bal;
        b.total += bal;
    }
    return roundBuckets(b);
}
function roundBuckets(b) {
    const r = (n) => Math.round(n * 100) / 100;
    return { current: r(b.current), d1_30: r(b.d1_30), d31_60: r(b.d31_60), d61_90: r(b.d61_90), d90_plus: r(b.d90_plus), total: r(b.total) };
}
function emptyVatSummary() {
    const s = {};
    for (const c of exports.TAX_CATEGORIES)
        s[c] = { net: 0, vat: 0 };
    return s;
}
function vatSummary(invoiceLines, creditNoteLines) {
    const s = emptyVatSummary();
    for (const l of invoiceLines) {
        s[l.taxCategory].net += l.net;
        s[l.taxCategory].vat += l.vat;
    }
    for (const l of creditNoteLines) {
        s[l.taxCategory].net -= l.net;
        s[l.taxCategory].vat -= l.vat;
    }
    for (const c of exports.TAX_CATEGORIES) {
        s[c].net = round2(s[c].net);
        s[c].vat = round2(s[c].vat);
    }
    return s;
}
function vatTotals(s) {
    let net = 0, vat = 0;
    for (const c of exports.TAX_CATEGORIES) {
        net += s[c].net;
        vat += s[c].vat;
    }
    return { net: round2(net), vat: round2(vat) };
}
function round2(n) { return Math.round(n * 100) / 100; }
// ── CSV escaping with formula-injection guard ───────────────
//
// Guards against CSV injection: a cell beginning with = + - @ (or
// tab/CR) is prefixed with a single quote so spreadsheet apps do not
// evaluate it as a formula. Also quotes cells containing "," '"' or
// newlines and doubles internal quotes.
function csvCell(value) {
    let s = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s))
        s = `'${s}`;
    if (/[",\n\r]/.test(s))
        s = `"${s.replace(/"/g, '""')}"`;
    return s;
}
function toCsv(header, rows) {
    const lines = [header.map(csvCell).join(',')];
    for (const r of rows)
        lines.push(r.map(csvCell).join(','));
    return lines.join('\r\n') + '\r\n';
}
const vatCode = (m, cat) => m.vat_codes[cat]?.code ?? '';
const sign = (kind) => (kind === 'credit_note' ? -1 : 1);
// --- Xero: Sales Invoices / Credit Notes import (docs: Xero "Import
//     your sales invoices" — ContactName, InvoiceNumber, InvoiceDate,
//     DueDate, Description, Quantity, UnitAmount, AccountCode, TaxType).
function xeroDocs(docs, m) {
    const header = ['ContactName', 'InvoiceNumber', 'InvoiceDate', 'DueDate', 'Description', 'Quantity', 'UnitAmount', 'AccountCode', 'TaxType', 'Currency'];
    const rows = [];
    for (const d of docs) {
        for (const l of d.lines) {
            rows.push([d.contact, d.number, d.date, d.dueDate ?? d.date,
                l.description ?? (d.kind === 'credit_note' ? 'Credit' : 'Sale'),
                1, round2(l.net * sign(d.kind)), m.sales_account, vatCode(m, l.taxCategory), d.currency]);
        }
    }
    return { header, rows };
}
// --- QuickBooks Online: detailed invoice import columns.
function qboDocs(docs, m) {
    const header = ['InvoiceNo', 'Customer', 'InvoiceDate', 'DueDate', 'ItemDescription', 'ItemQuantity', 'ItemAmount', 'ItemTaxCode', 'Currency'];
    const rows = [];
    for (const d of docs) {
        for (const l of d.lines) {
            rows.push([d.number, d.contact, d.date, d.dueDate ?? d.date,
                l.description ?? (d.kind === 'credit_note' ? 'Credit' : 'Sale'),
                1, round2(l.net * sign(d.kind)), vatCode(m, l.taxCategory), d.currency]);
        }
    }
    return { header, rows };
}
// --- Sage 50: audit-trail style rows (Type SI/SC, AccountRef, Nominal,
//     Date, Reference, Details, NetAmount, TaxCode, TaxAmount).
function sageDocs(docs, m) {
    const header = ['Type', 'AccountRef', 'Nominal', 'Date', 'Reference', 'Details', 'NetAmount', 'TaxCode', 'TaxAmount'];
    const rows = [];
    for (const d of docs) {
        const type = d.kind === 'credit_note' ? 'SC' : 'SI';
        for (const l of d.lines) {
            // Sage credit notes are entered as positive amounts under the SC type.
            rows.push([type, truncate(d.contact, 8).toUpperCase(), m.sales_account, d.date, d.number,
                l.description ?? d.contact, round2(l.net), vatCode(m, l.taxCategory), round2(l.vat)]);
        }
    }
    return { header, rows };
}
// --- Generic: full, self-describing canonical CSV.
function genericDocs(docs, m) {
    const header = ['DocType', 'Number', 'Date', 'DueDate', 'Contact', 'Reference', 'Description', 'TaxCategory', 'TaxCode', 'Net', 'VAT', 'Gross', 'Currency'];
    const rows = [];
    for (const d of docs) {
        for (const l of d.lines) {
            const s = sign(d.kind);
            rows.push([d.kind, d.number, d.date, d.dueDate ?? '', d.contact, d.reference ?? '',
                l.description ?? '', l.taxCategory, vatCode(m, l.taxCategory),
                round2(l.net * s), round2(l.vat * s), round2((l.net + l.vat) * s), d.currency]);
        }
    }
    return { header, rows };
}
function buildDocCsv(adapter, docs, m) {
    switch (adapter) {
        case 'xero': return xeroDocs(docs, m);
        case 'quickbooks': return qboDocs(docs, m);
        case 'sage': return sageDocs(docs, m);
        default: return genericDocs(docs, m);
    }
}
/** Cash movements (payments + refunds) — a common receipts CSV across adapters. */
function buildCashCsv(cash) {
    const header = ['Type', 'Number', 'Date', 'Contact', 'Method', 'Reference', 'AppliesTo', 'Amount', 'Currency'];
    const rows = cash.map(c => [
        c.kind, c.number, c.date, c.contact, c.method ?? '', c.reference ?? '', c.appliesTo ?? '',
        round2(c.amount * (c.kind === 'refund' ? -1 : 1)), c.currency,
    ]);
    return { header, rows };
}
function truncate(s, n) { return (s ?? '').slice(0, n); }
