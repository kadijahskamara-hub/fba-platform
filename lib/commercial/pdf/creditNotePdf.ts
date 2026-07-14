import 'server-only'
import { renderDocument, money, type DocModel } from './theme'

// Credit note from its frozen snapshot. The credit-note number is not
// stored in the snapshot, so it is supplied by the caller.
type Snap = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export function buildCreditNoteModel(snapshot: Snap, documentNumber: string): DocModel {
  const currency = String(snapshot.currency ?? 'GBP')
  const company = (snapshot.company ?? {}) as Snap
  const totals = (snapshot.totals ?? {}) as Snap
  const lines = (snapshot.lines ?? []) as Snap[]

  return {
    docLabel: 'CREDIT NOTE',
    documentNumber,
    metaRight: [
      ...(snapshot.issued_at ? [['Issued', String(snapshot.issued_at).slice(0, 10)] as [string, string]] : []),
    ],
    company: {
      legal_name: String(company.legal_name ?? 'Full Bloom Artelier'),
      address: company.address ?? null, vat_number: company.vat_number ?? null,
    },
    parties: [],
    columns: [
      { header: 'Description', width: 48 },
      { header: 'Qty', width: 8, align: 'right' },
      { header: 'Unit', width: 14, align: 'right' },
      { header: 'Tax', width: 10, align: 'right' },
      { header: 'Amount', width: 16, align: 'right' },
    ],
    rows: lines.map(l => [
      String(l.name ?? ''),
      String(Number(l.quantity ?? 0)),
      money(Number(l.unit_price), currency),
      l.tax_category ? String(l.tax_category) : '—',
      money(Number(l.line_gross_total), currency),
    ]),
    totals: [
      ['Subtotal (net)', money(Number(totals.subtotal), currency)],
      ['VAT', money(Number(totals.tax_total), currency)],
      ['Total credited', money(Number(totals.gross_total), currency), true],
    ],
    notes: snapshot.reason ? [{ title: 'Reason', body: String(snapshot.reason) }] : [],
    bank: null,
    showTerms: false,
    confidential: 'Confidential — for client use only',
  }
}

export function creditNotePdf(snapshot: Snap, documentNumber: string): Buffer {
  return renderDocument(buildCreditNoteModel(snapshot, documentNumber))
}
