import 'server-only'
import { renderDocument, money, type DocModel } from './theme'

// Payment receipt from its frozen snapshot.
type Snap = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export function buildReceiptModel(snapshot: Snap): DocModel {
  const currency = String(snapshot.currency ?? 'GBP')
  const company = (snapshot.company ?? {}) as Snap
  const allocations = (snapshot.allocations ?? []) as Snap[]

  const meta: Array<[string, string]> = []
  if (snapshot.payment_date) meta.push(['Payment date', String(snapshot.payment_date)])
  if (snapshot.payment_method) meta.push(['Method', String(snapshot.payment_method)])
  if (snapshot.payment_reference) meta.push(['Reference', String(snapshot.payment_reference)])

  const totalRows: DocModel['totals'] = [['Amount received', money(Number(snapshot.amount), currency), true]]
  if (Number(snapshot.unallocated_amount ?? 0) > 0) {
    totalRows.push(['Unallocated', money(Number(snapshot.unallocated_amount), currency)])
  }

  return {
    docLabel: 'RECEIPT',
    documentNumber: String(snapshot.receipt_number ?? ''),
    metaRight: meta,
    company: { legal_name: String(company.legal_name ?? 'Full Bloom Artelier'), email: company.email ?? null, vat_number: company.vat_number ?? null },
    parties: [],
    columns: [
      { header: 'Applied to invoice', width: 40 },
      { header: 'Amount', width: 16, align: 'right' },
    ],
    rows: allocations.length
      ? allocations.map(a => [String(a.invoice_number ?? '—'), money(Number(a.amount), currency)])
      : [['Payment on account', money(Number(snapshot.amount), currency)]],
    totals: totalRows,
    notes: [{ title: 'Thank you', body: 'We confirm receipt of your payment with thanks. This receipt is for your records.' }],
    bank: null,
    showTerms: false,
    confidential: 'Confidential — for client use only',
  }
}

export function receiptPdf(snapshot: Snap): Buffer {
  return renderDocument(buildReceiptModel(snapshot))
}
