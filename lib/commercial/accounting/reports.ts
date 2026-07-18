import 'server-only'
import { supabaseAdmin } from '../../supabase'
import type { TaxCategory } from '../types'
import {
  agedDebtorBuckets, vatSummary, vatTotals, TAX_CATEGORIES,
  type AgedInvoice, type TaxLine,
} from '../accountingLogic'
import { unallocatedPaymentExceptions } from '../invoiceCalculations'

// ============================================================
// Accounting audit reports (Sprint 6). Each builder returns a
// generic { title, columns, rows, summary } shape the route renders
// as an HTML print table or a CSV (?format=csv). Sales/output side
// only — supplier bills are out of scope.
// ============================================================

export interface ReportTable {
  title: string
  columns: string[]
  rows: Array<Array<string | number>>
  summary?: Array<[string, string]>
  note?: string
}

const money = (n: unknown) => Number(n ?? 0).toFixed(2)

// ── Aged debtors (current / 1-30 / 31-60 / 61-90 / 90+) ─────
export async function agedDebtorsReport(asOf: string): Promise<ReportTable> {
  const { data: invs } = await supabaseAdmin.from('sales_invoices')
    .select('invoice_number, client_snapshot, issue_date, due_date, balance_due, status')
    .not('locked_at', 'is', null).in('status', ['issued', 'partially_paid', 'overdue', 'credited'])
  const rows: ReportTable['rows'] = []
  const aged: AgedInvoice[] = []
  for (const inv of invs ?? []) {
    if (Number(inv.balance_due ?? 0) <= 0) continue
    const name = String((inv.client_snapshot as Record<string, unknown> | null)?.name ?? 'Client')
    rows.push([inv.invoice_number, name, inv.issue_date ?? '', inv.due_date ?? '', money(inv.balance_due)])
    aged.push({ balance_due: Number(inv.balance_due), due_date: inv.due_date, issue_date: inv.issue_date })
  }
  const b = agedDebtorBuckets(aged, asOf)
  return {
    title: `Aged debtors as of ${asOf}`,
    columns: ['Invoice', 'Client', 'Issued', 'Due', 'Balance'],
    rows: rows.sort((a, b2) => String(a[3]).localeCompare(String(b2[3]))),
    summary: [
      ['Current', money(b.current)], ['1–30 days', money(b.d1_30)], ['31–60 days', money(b.d31_60)],
      ['61–90 days', money(b.d61_90)], ['90+ days', money(b.d90_plus)], ['Total outstanding', money(b.total)],
    ],
  }
}

// ── VAT summary (accrual: invoices minus credit notes) ──────
export async function vatSummaryReport(from: string, to: string): Promise<ReportTable> {
  const invLines = await taxLinesForInvoices(from, to)
  const cnLines = await taxLinesForCreditNotes(from, to)
  const s = vatSummary(invLines, cnLines)
  const rows: ReportTable['rows'] = TAX_CATEGORIES.map(c => [c, money(s[c].net), money(s[c].vat)])
  const t = vatTotals(s)
  return {
    title: `VAT summary (accrual) ${from} → ${to}`,
    columns: ['Tax category', 'Net', 'VAT'],
    rows,
    summary: [['Total net', money(t.net)], ['Total output VAT', money(t.vat)]],
    note: 'Sales/output side only — supports the VAT return; does not file it.',
  }
}

async function taxLinesForInvoices(from: string, to: string): Promise<TaxLine[]> {
  const { data: invs } = await supabaseAdmin.from('sales_invoices')
    .select('id, issue_date, tax_point_date, status').not('locked_at', 'is', null)
    .in('status', ['issued', 'partially_paid', 'paid', 'overdue', 'credited'])
  const out: TaxLine[] = []
  for (const inv of invs ?? []) {
    const tp = (inv.tax_point_date ?? inv.issue_date) as string | null
    if (!tp || tp < from || tp > to) continue
    const { data: lines } = await supabaseAdmin.from('sales_invoice_lines').select('tax_category, line_net_total, line_tax_total').eq('sales_invoice_id', inv.id)
    for (const l of lines ?? []) out.push({ taxCategory: (l.tax_category ?? 'standard') as TaxCategory, net: Number(l.line_net_total ?? 0), vat: Number(l.line_tax_total ?? 0) })
  }
  return out
}

async function taxLinesForCreditNotes(from: string, to: string): Promise<TaxLine[]> {
  const { data: cns } = await supabaseAdmin.from('credit_notes').select('id, issued_at, tax_point_date, status').in('status', ['issued', 'allocated'])
  const out: TaxLine[] = []
  for (const cn of cns ?? []) {
    const tp = (cn.tax_point_date ?? (cn.issued_at ? String(cn.issued_at).slice(0, 10) : null)) as string | null
    if (!tp || tp < from || tp > to) continue
    const { data: lines } = await supabaseAdmin.from('credit_note_lines').select('tax_category, line_net_total, line_tax_total').eq('credit_note_id', cn.id)
    for (const l of lines ?? []) out.push({ taxCategory: (l.tax_category ?? 'standard') as TaxCategory, net: Number(l.line_net_total ?? 0), vat: Number(l.line_tax_total ?? 0) })
  }
  return out
}

// ── Period integrity: what changed since a period closed ────
export async function periodIntegrityReport(periodId: string): Promise<ReportTable> {
  const { data: p } = await supabaseAdmin.from('accounting_periods').select('*').eq('id', periodId).single()
  if (!p) return { title: 'Period integrity', columns: ['—'], rows: [], note: 'Period not found.' }
  if (p.status !== 'closed' || !p.closed_at) {
    return { title: `Period integrity — ${p.label}`, columns: ['—'], rows: [], note: 'Period is not closed; integrity applies only to closed periods.' }
  }
  const rows: ReportTable['rows'] = []
  const addWhere = async (table: string, tpExpr: (r: Record<string, unknown>) => string | null, label: string, numberField: string) => {
    const { data } = await supabaseAdmin.from(table).select('*')
    for (const r of data ?? []) {
      const tp = tpExpr(r)
      if (!tp || tp < p.starts_on || tp > p.ends_on) continue
      if (r.updated_at && String(r.updated_at) > String(p.closed_at)) {
        rows.push([label, String(r[numberField] ?? r.id), tp, String(r.updated_at).slice(0, 19)])
      }
    }
  }
  await addWhere('sales_invoices', r => (r.tax_point_date ?? r.issue_date) as string | null, 'Invoice', 'invoice_number')
  await addWhere('credit_notes', r => (r.tax_point_date ?? (r.issued_at ? String(r.issued_at).slice(0, 10) : null)) as string | null, 'Credit note', 'credit_note_number')
  await addWhere('payments', r => r.payment_date as string | null, 'Payment', 'payment_reference')
  await addWhere('refunds', r => r.refund_date as string | null, 'Refund', 'refund_number')
  return {
    title: `Period integrity — ${p.label} (${p.starts_on} → ${p.ends_on})`,
    columns: ['Type', 'Document', 'Tax point', 'Changed at'],
    rows,
    note: rows.length === 0 ? 'No changes since the period closed — integrity intact.' : 'These documents changed AFTER the period was closed and need review.',
  }
}

// ── Reconciliation exceptions ───────────────────────────────
export async function reconciliationExceptionsReport(): Promise<ReportTable> {
  const rows: ReportTable['rows'] = []
  for (const table of ['sales_invoices', 'credit_notes', 'payments', 'refunds']) {
    const numberField = table === 'sales_invoices' ? 'invoice_number' : table === 'credit_notes' ? 'credit_note_number' : table === 'payments' ? 'payment_reference' : 'refund_number'
    const { data } = await supabaseAdmin.from(table).select(`id, ${numberField}, reconciliation_status`).eq('reconciliation_status', 'needs_re_export')
    for (const r of data ?? []) rows.push(['needs_re_export', table, String((r as Record<string, unknown>)[numberField] ?? r.id)])
  }
  // Overdue unapproved refunds (pending > 7 days)
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data: staleRfd } = await supabaseAdmin.from('refunds').select('refund_number, created_at').eq('status', 'pending').lt('created_at', cutoff)
  for (const r of staleRfd ?? []) rows.push(['refund_pending>7d', 'refunds', r.refund_number])
  // Unallocated issued credit notes with remaining balance
  const { data: cns } = await supabaseAdmin.from('credit_notes').select('credit_note_number, gross_total, allocated_total, status').in('status', ['issued', 'allocated'])
  for (const c of cns ?? []) {
    if (Number(c.gross_total ?? 0) - Number(c.allocated_total ?? 0) > 0.005) rows.push(['credit_unallocated', 'credit_notes', c.credit_note_number])
  }
  // Confirmed payments still carrying unallocated money (Sprint 16).
  // This report previously ignored them entirely and reported "everything
  // reconciles" while the Operations "Workload & Open Items" panel listed
  // the very same payments as exceptions. Both now use one rule.
  const { data: payRows } = await supabaseAdmin.from('payments')
    .select('payment_reference, amount, status, payment_allocations(amount)')
    .eq('status', 'confirmed')
  for (const e of unallocatedPaymentExceptions(((payRows ?? []) as Record<string, unknown>[]).map(p => ({
    reference: (p.payment_reference as string) ?? '',
    status: (p.status as string) ?? '',
    amount: Number(p.amount ?? 0),
    allocatedTotal: ((p.payment_allocations as { amount: number }[] | null) ?? [])
      .reduce((s, a) => s + Number(a.amount ?? 0), 0),
  })))) {
    rows.push([e.kind, 'payments', `${e.reference} (${money(e.unallocated)} unallocated)`])
  }
  return {
    title: 'Reconciliation exceptions',
    columns: ['Exception', 'Table', 'Document'],
    rows,
    note: rows.length === 0 ? 'No exceptions — everything reconciles.' : undefined,
  }
}

// ── Document audit trail (invoice-centred chain) ────────────
export async function auditTrailReport(invoiceId: string): Promise<ReportTable> {
  const { data: inv } = await supabaseAdmin.from('sales_invoices').select('*').eq('id', invoiceId).single()
  if (!inv) return { title: 'Audit trail', columns: ['—'], rows: [], note: 'Invoice not found.' }
  const rows: ReportTable['rows'] = []
  rows.push(['Invoice', inv.invoice_number ?? '(draft)', inv.issue_date ?? '', inv.status, money(inv.gross_total)])
  if (inv.source_proforma_id) {
    const { data: pf } = await supabaseAdmin.from('proformas').select('proforma_number, quote_number').eq('id', inv.source_proforma_id).single()
    if (pf) rows.push(['Source', pf.quote_number ?? pf.proforma_number ?? '', '', 'proforma', ''])
  }
  const { data: pays } = await supabaseAdmin.from('payment_allocations').select('amount, payment:payments(payment_reference, payment_date, status)').eq('sales_invoice_id', invoiceId)
  for (const a of pays ?? []) {
    const raw = (a as { payment?: unknown }).payment
    const p = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined ?? {}
    rows.push(['Payment', String(p.payment_reference ?? ''), String(p.payment_date ?? ''), String(p.status ?? ''), money(a.amount)])
  }
  const { data: creds } = await supabaseAdmin.from('credit_notes').select('credit_note_number, issued_at, status, gross_total').eq('sales_invoice_id', invoiceId)
  for (const c of creds ?? []) rows.push(['Credit note', c.credit_note_number ?? '(draft)', c.issued_at ? String(c.issued_at).slice(0, 10) : '', c.status, money(c.gross_total)])
  const { data: rfds } = await supabaseAdmin.from('refunds').select('refund_number, refund_date, status, amount').eq('sales_invoice_id', invoiceId)
  for (const r of rfds ?? []) rows.push(['Refund', r.refund_number, r.refund_date, r.status, money(r.amount)])
  return { title: `Audit trail — ${inv.invoice_number ?? invoiceId}`, columns: ['Stage', 'Reference', 'Date', 'Status', 'Amount'], rows }
}
