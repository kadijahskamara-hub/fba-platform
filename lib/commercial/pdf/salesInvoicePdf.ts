import 'server-only'
import { renderDocument, money, type DocModel } from './theme'

// Dedicated client invoice (sales_invoices) from its frozen snapshot.
type Snap = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export function buildSalesInvoiceModel(snapshot: Snap): DocModel {
  const currency = String(snapshot.currency ?? 'GBP')
  const client = (snapshot.client ?? {}) as Snap
  const company = (snapshot.company ?? {}) as Snap
  const bank = (snapshot.bank ?? {}) as Snap
  const totals = (snapshot.totals ?? {}) as Snap
  const lines = (snapshot.lines ?? []) as Snap[]

  const meta: Array<[string, string]> = []
  if (snapshot.issue_date) meta.push(['Issue date', String(snapshot.issue_date)])
  if (snapshot.due_date) meta.push(['Due date', String(snapshot.due_date)])
  if (snapshot.project?.name) meta.push(['Project', String(snapshot.project.name)])

  return {
    docLabel: snapshot.invoice_type === 'service' ? 'SERVICE INVOICE' : 'INVOICE',
    documentNumber: String(snapshot.invoice_number ?? ''),
    metaRight: meta,
    company: {
      legal_name: String(company.legal_name ?? 'Full Bloom Artelier'),
      address: company.address ?? null, email: company.email ?? null, phone: company.phone ?? null,
      vat_number: company.vat_number ?? null, registration_number: company.registration_number ?? null,
    },
    parties: [
      { label: 'Bill to', lines: [client.name, client.company, ...String(snapshot.billing_address ?? '').split('\n'), client.email].filter(Boolean) },
    ],
    columns: [
      { header: 'Description', width: 48 },
      { header: 'Qty', width: 8, align: 'right' },
      { header: 'Unit', width: 14, align: 'right' },
      { header: 'Tax', width: 10, align: 'right' },
      { header: 'Amount', width: 16, align: 'right' },
    ],
    rows: lines.map(l => [
      [l.name, l.description, l.specification].filter(Boolean).join(' — ').slice(0, 200),
      String(Number(l.quantity ?? 0)),
      money(Number(l.unit_price), currency),
      l.tax_category ? String(l.tax_category) : '—',
      money(Number(l.line_gross_total), currency),
    ]),
    totals: [
      ['Subtotal (net)', money(Number(totals.subtotal), currency)],
      ['VAT', money(Number(totals.tax_total), currency)],
      ['Total due', money(Number(totals.gross_total), currency), true],
    ],
    notes: snapshot.payment_terms ? [{ title: 'Payment terms', body: String(snapshot.payment_terms) }] : [],
    bank: { bank_name: bank.bank_name, account_name: bank.account_name, account_number: bank.account_number, sort_code: bank.sort_code },
    showTerms: true,
    confidential: 'Confidential — for client use only',
  }
}

export function salesInvoicePdf(snapshot: Snap): Buffer {
  return renderDocument(buildSalesInvoiceModel(snapshot))
}
