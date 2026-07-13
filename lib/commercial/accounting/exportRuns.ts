import 'server-only'
import { createHash } from 'crypto'
import { supabaseAdmin } from '../../supabase'
import { logAudit } from '../../audit'
import type { SessionUser } from '../../types'
import type { TaxCategory } from '../types'
import {
  buildDocCsv, buildCashCsv, toCsv, vatSummary, vatTotals,
  type AdapterName, type AccountMapping, type ExportDoc, type CashDoc, type CsvFile, type TaxLine,
} from '../accountingLogic'

// ============================================================
// Accounting export runs (Sprint 6). Gather issued/confirmed
// financial documents over a date range (or period), build one
// checksummed CSV per document type via the selected package
// adapter, store them in the private `accounting-exports` bucket,
// and stamp the covered documents as `exported` (atomic SQL fn).
// ============================================================

const BUCKET = 'accounting-exports'
const SIGNED_TTL = 600

interface DomainErr { error: string; status: number }
type Result<T> = { data: T } | DomainErr

export type DocType = 'invoices' | 'credit_notes' | 'payments' | 'refunds'
export const DOC_TYPES: DocType[] = ['invoices', 'credit_notes', 'payments', 'refunds']

export interface ExportScope {
  from: string
  to: string
  periodId?: string | null
  docTypes?: DocType[]
}

function sha256(s: string): string { return createHash('sha256').update(s, 'utf-8').digest('hex') }
const contactOf = (snap: unknown) => {
  const s = (snap ?? {}) as Record<string, unknown>
  return String(s.name ?? s.company ?? 'Client')
}

async function loadMapping(adapter: AdapterName): Promise<AccountMapping> {
  const { data } = await supabaseAdmin.from('account_code_mappings').select('*').eq('adapter', adapter).single()
  return {
    sales_account: data?.sales_account ?? 'SALES',
    debtors_account: data?.debtors_account ?? 'DEBTORS',
    rounding_account: data?.rounding_account ?? null,
    bank_account: data?.bank_account ?? null,
    vat_codes: (data?.vat_codes ?? {}) as AccountMapping['vat_codes'],
  }
}

/** Resolve the scope's date window (a period overrides from/to). */
async function resolveWindow(scope: ExportScope): Promise<{ from: string; to: string }> {
  if (scope.periodId) {
    const { data } = await supabaseAdmin.from('accounting_periods').select('starts_on, ends_on').eq('id', scope.periodId).single()
    if (data) return { from: data.starts_on, to: data.ends_on }
  }
  return { from: scope.from, to: scope.to }
}

interface Gathered {
  invoiceDocs: ExportDoc[]; creditDocs: ExportDoc[]; payDocs: CashDoc[]; refundDocs: CashDoc[]
  ids: { sales_invoices: string[]; credit_notes: string[]; payments: string[]; refunds: string[] }
  invoiceTaxLines: TaxLine[]; creditTaxLines: TaxLine[]
  totals: { invoices_gross: number; credit_gross: number; payments: number; refunds: number }
}

async function gather(from: string, to: string): Promise<Gathered> {
  // Invoices (issued, non-void) with tax point in window.
  const { data: invs } = await supabaseAdmin.from('sales_invoices')
    .select('id, invoice_number, issue_date, due_date, tax_point_date, currency, client_snapshot, status')
    .not('locked_at', 'is', null)
    .in('status', ['issued', 'partially_paid', 'paid', 'overdue', 'credited'])
  const invoiceDocs: ExportDoc[] = []
  const invoiceTaxLines: TaxLine[] = []
  const invIds: string[] = []
  let invoicesGross = 0
  for (const inv of invs ?? []) {
    const tp = (inv.tax_point_date ?? inv.issue_date) as string | null
    if (!tp || tp < from || tp > to) continue
    const { data: lines } = await supabaseAdmin.from('sales_invoice_lines').select('tax_category, line_net_total, line_tax_total, name_snapshot').eq('sales_invoice_id', inv.id)
    const grouped = groupByCategory(lines ?? [])
    invoiceDocs.push({ kind: 'invoice', number: inv.invoice_number, date: tp, dueDate: inv.due_date, contact: contactOf(inv.client_snapshot), currency: inv.currency, lines: grouped })
    for (const g of grouped) { invoiceTaxLines.push({ taxCategory: g.taxCategory, net: g.net, vat: g.vat }); invoicesGross += g.net + g.vat }
    invIds.push(inv.id)
  }

  // Credit notes (issued/allocated) with tax point in window.
  const { data: cns } = await supabaseAdmin.from('credit_notes')
    .select('id, credit_note_number, issued_at, tax_point_date, currency, client_id, status').in('status', ['issued', 'allocated'])
  const creditDocs: ExportDoc[] = []
  const creditTaxLines: TaxLine[] = []
  const cnIds: string[] = []
  let creditGross = 0
  for (const cn of cns ?? []) {
    const tp = (cn.tax_point_date ?? (cn.issued_at ? String(cn.issued_at).slice(0, 10) : null)) as string | null
    if (!tp || tp < from || tp > to) continue
    const { data: lines } = await supabaseAdmin.from('credit_note_lines').select('tax_category, line_net_total, line_tax_total, name_snapshot').eq('credit_note_id', cn.id)
    const grouped = groupByCategory(lines ?? [])
    creditDocs.push({ kind: 'credit_note', number: cn.credit_note_number, date: tp, contact: 'Client', currency: cn.currency, lines: grouped })
    for (const g of grouped) { creditTaxLines.push({ taxCategory: g.taxCategory, net: g.net, vat: g.vat }); creditGross += g.net + g.vat }
    cnIds.push(cn.id)
  }

  // Payments (confirmed) in window.
  const { data: pays } = await supabaseAdmin.from('payments')
    .select('id, payment_reference, payment_date, currency, amount, payment_method, status')
    .eq('status', 'confirmed').gte('payment_date', from).lte('payment_date', to)
  const payDocs: CashDoc[] = []
  const payIds: string[] = []
  let paymentsTotal = 0
  for (const p of pays ?? []) {
    payDocs.push({ kind: 'payment', number: p.payment_reference ?? p.id, date: p.payment_date, contact: 'Client', currency: p.currency, amount: Number(p.amount), method: p.payment_method })
    paymentsTotal += Number(p.amount); payIds.push(p.id)
  }

  // Refunds (completed) in window.
  const { data: rfds } = await supabaseAdmin.from('refunds')
    .select('id, refund_number, refund_date, currency, amount, method, external_reference, status').eq('status', 'completed').gte('refund_date', from).lte('refund_date', to)
  const refundDocs: CashDoc[] = []
  const rfdIds: string[] = []
  let refundsTotal = 0
  for (const r of rfds ?? []) {
    refundDocs.push({ kind: 'refund', number: r.refund_number, date: r.refund_date, contact: 'Client', currency: r.currency, amount: Number(r.amount), method: r.method, reference: r.external_reference })
    refundsTotal += Number(r.amount); rfdIds.push(r.id)
  }

  return {
    invoiceDocs, creditDocs, payDocs, refundDocs,
    ids: { sales_invoices: invIds, credit_notes: cnIds, payments: payIds, refunds: rfdIds },
    invoiceTaxLines, creditTaxLines,
    totals: { invoices_gross: round2(invoicesGross), credit_gross: round2(creditGross), payments: round2(paymentsTotal), refunds: round2(refundsTotal) },
  }
}

function groupByCategory(lines: Array<Record<string, unknown>>): ExportDoc['lines'] {
  const map = new Map<TaxCategory, { net: number; vat: number }>()
  for (const l of lines) {
    const cat = (l.tax_category ?? 'standard') as TaxCategory
    const g = map.get(cat) ?? { net: 0, vat: 0 }
    g.net += Number(l.line_net_total ?? 0); g.vat += Number(l.line_tax_total ?? 0)
    map.set(cat, g)
  }
  return [...map.entries()].map(([taxCategory, g]) => ({ taxCategory, net: round2(g.net), vat: round2(g.vat) }))
}

function round2(n: number): number { return Math.round(n * 100) / 100 }

export async function runExport(params: { adapter: AdapterName; scope: ExportScope; actor: SessionUser }): Promise<Result<{ run: Record<string, unknown> }>> {
  const { adapter, scope, actor } = params
  const win = await resolveWindow(scope)
  if (!win.from || !win.to) return { error: 'A date range or period is required.', status: 400 }
  const wanted = scope.docTypes && scope.docTypes.length ? scope.docTypes : DOC_TYPES

  const mapping = await loadMapping(adapter)
  const g = await gather(win.from, win.to)

  const files: Partial<Record<DocType, CsvFile>> = {}
  if (wanted.includes('invoices')) files.invoices = buildDocCsv(adapter, g.invoiceDocs, mapping)
  if (wanted.includes('credit_notes')) files.credit_notes = buildDocCsv(adapter, g.creditDocs, mapping)
  if (wanted.includes('payments')) files.payments = buildCashCsv(g.payDocs)
  if (wanted.includes('refunds')) files.refunds = buildCashCsv(g.refundDocs)

  const { data: numData, error: numErr } = await supabaseAdmin.rpc('next_export_number')
  if (numErr || !numData) return { error: 'Could not allocate an export number.', status: 500 }
  const runNumber = numData as string

  const storagePaths: Record<string, string> = {}
  const sha256s: Record<string, string> = {}
  const rowCounts: Record<string, number> = {}
  for (const [docType, file] of Object.entries(files) as Array<[DocType, CsvFile]>) {
    const csv = toCsv(file.header, file.rows)
    const path = `${runNumber}/${docType}.csv`
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, Buffer.from(csv, 'utf-8'), { contentType: 'text/csv', upsert: false })
    if (upErr) return { error: `Storage upload failed: ${upErr.message}`, status: 500 }
    storagePaths[docType] = path
    sha256s[docType] = sha256(csv)
    rowCounts[docType] = file.rows.length
  }

  const vat = vatTotals(vatSummary(g.invoiceTaxLines, g.creditTaxLines))
  const totals = { ...g.totals, vat_net: vat.net, vat_amount: vat.vat }

  const { data: run, error } = await supabaseAdmin.from('export_runs').insert({
    run_number: runNumber, adapter,
    scope: { from: win.from, to: win.to, period_id: scope.periodId ?? null, doc_types: wanted },
    row_counts: rowCounts, totals, storage_paths: storagePaths, sha256s, created_by: actor.id,
  }).select().single()
  if (error || !run) return { error: error?.message ?? 'Could not record export run', status: 500 }

  // Stamp covered docs as exported (only the requested doc types).
  const refs: Record<string, string[]> = {}
  if (wanted.includes('invoices')) refs.sales_invoices = g.ids.sales_invoices
  if (wanted.includes('credit_notes')) refs.credit_notes = g.ids.credit_notes
  if (wanted.includes('payments')) refs.payments = g.ids.payments
  if (wanted.includes('refunds')) refs.refunds = g.ids.refunds
  await supabaseAdmin.rpc('stamp_export_run', { p_run: run.id, p_refs: refs })

  await logAudit({ actor, action: 'commercial.export_run', entityType: 'export_run', entityId: run.id, after: { runNumber, adapter, rowCounts, totals } })
  return { data: { run } }
}

export async function signedExportFile(runId: string, docType: string, actor: SessionUser): Promise<Result<{ url: string }>> {
  const { data: run } = await supabaseAdmin.from('export_runs').select('storage_paths').eq('id', runId).single()
  if (!run) return { error: 'Export run not found', status: 404 }
  const path = (run.storage_paths as Record<string, string>)[docType]
  if (!path) return { error: 'No such file in this export run.', status: 404 }
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL)
  if (error || !data?.signedUrl) return { error: 'Could not create download link', status: 500 }
  await logAudit({ actor, action: 'commercial.export_downloaded', entityType: 'export_run', entityId: runId, after: { docType } })
  return { data: { url: data.signedUrl } }
}

export async function verifyExportRun(runId: string): Promise<Result<{ results: Record<string, { match: boolean }> }>> {
  const { data: run } = await supabaseAdmin.from('export_runs').select('storage_paths, sha256s').eq('id', runId).single()
  if (!run) return { error: 'Export run not found', status: 404 }
  const paths = run.storage_paths as Record<string, string>
  const hashes = run.sha256s as Record<string, string>
  const results: Record<string, { match: boolean }> = {}
  for (const [docType, path] of Object.entries(paths)) {
    const { data: blob } = await supabaseAdmin.storage.from(BUCKET).download(path)
    if (!blob) { results[docType] = { match: false }; continue }
    const actual = sha256(await blob.text())
    results[docType] = { match: actual === hashes[docType] }
  }
  return { data: { results } }
}

// ── Reconciliation: bulk mark reconciled / excluded ─────────

const TABLE_FOR: Record<string, string> = {
  invoices: 'sales_invoices', credit_notes: 'credit_notes', payments: 'payments', refunds: 'refunds',
}

export async function reconcileDocuments(params: {
  docType: DocType; ids: string[]; action: 'reconciled' | 'excluded'; note?: string | null; actor: SessionUser
}): Promise<Result<{ updated: number }>> {
  const table = TABLE_FOR[params.docType]
  if (!table || params.ids.length === 0) return { error: 'Nothing to reconcile.', status: 400 }
  const patch: Record<string, unknown> = { reconciliation_status: params.action, updated_at: new Date().toISOString() }
  if (params.action === 'reconciled') { patch.reconciled_by = params.actor.id; patch.reconciled_at = new Date().toISOString() }
  if (params.note) patch.reconciliation_note = String(params.note).slice(0, 2000)

  let q = supabaseAdmin.from(table).update(patch).in('id', params.ids)
  if (params.action === 'reconciled') q = q.in('reconciliation_status', ['exported', 'needs_re_export'])
  const { data, error } = await q.select('id')
  if (error) return { error: error.message, status: 500 }
  await logAudit({ actor: params.actor, action: 'commercial.reconciled', entityType: table, entityId: null, after: { action: params.action, count: (data ?? []).length } })
  return { data: { updated: (data ?? []).length } }
}
