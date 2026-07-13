import 'server-only'
import { renderDocument, money, type DocModel } from './theme'

// Supplier purchase order from its frozen snapshot (buildPoSnapshotPayload).
type Snap = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export function buildPurchaseOrderModel(snapshot: Snap): DocModel {
  const po = (snapshot.po ?? {}) as Snap
  const currency = String(po.supplier_currency ?? 'GBP')
  const contact = (po.supplier_contact ?? {}) as Snap
  const lines = (snapshot.lines ?? []) as Snap[]
  const charges = (snapshot.charges ?? {}) as Snap
  const totals = (snapshot.totals ?? {}) as Snap

  const meta: Array<[string, string]> = []
  if (po.order_date) meta.push(['Order date', String(po.order_date)])
  if (po.required_by_date) meta.push(['Required by', String(po.required_by_date)])
  if (po.acknowledgement_due_date) meta.push(['Acknowledge by', String(po.acknowledgement_due_date)])
  if (po.commercial_order_reference) meta.push(['Order ref', String(po.commercial_order_reference)])

  const totalRows: DocModel['totals'] = [['Subtotal (net)', money(Number(totals.netSubtotal ?? 0), currency)]]
  if (Number(charges.shipping ?? 0) > 0) totalRows.push(['Shipping', money(Number(charges.shipping), currency)])
  if (Number(charges.packaging ?? 0) > 0) totalRows.push(['Packaging', money(Number(charges.packaging), currency)])
  if (Number(charges.other ?? 0) > 0) totalRows.push([String(charges.other_description || 'Other'), money(Number(charges.other), currency)])
  if (Number(charges.discount ?? 0) > 0) totalRows.push(['Discount', money(-Number(charges.discount), currency)])
  totalRows.push(['VAT', money(Number(totals.taxTotal ?? 0), currency)])
  totalRows.push(['Total', money(Number(totals.grandTotal ?? 0), currency), true])

  return {
    docLabel: 'PURCHASE ORDER',
    documentNumber: String(snapshot.documentNumber ?? po.purchase_order_number ?? ''),
    subtitle: Number(snapshot.revision ?? 1) > 1 ? `Revision ${snapshot.revision}` : null,
    metaRight: meta,
    company: { legal_name: 'Full Bloom Artelier', email: 'purchasing@fullbloom.uk.com' },
    parties: [
      { label: 'Supplier', lines: [contact.name, contact.company, contact.email, contact.phone].filter(Boolean) },
      { label: 'Deliver to', lines: String(po.delivery_address ?? '').split('\n').filter(Boolean) },
    ],
    columns: [
      { header: 'Item', width: 42 },
      { header: 'SKU', width: 14 },
      { header: 'Qty', width: 8, align: 'right' },
      { header: 'Unit cost', width: 14, align: 'right' },
      { header: 'Amount', width: 16, align: 'right' },
    ],
    rows: lines.map(l => [
      [l.product_name, l.description, l.finish, l.dimensions].filter(Boolean).join(' — ').slice(0, 200),
      String(l.supplier_sku ?? l.fba_sku ?? ''),
      String(Number(l.quantity ?? 0)),
      money(Number(l.supplier_cost_unit), currency),
      money(Number(l.line_net_total), currency),
    ]),
    totals: totalRows,
    notes: [
      ...(po.incoterms ? [{ title: 'Incoterms', body: String(po.incoterms) }] : []),
      ...(po.payment_terms ? [{ title: 'Payment terms', body: String(po.payment_terms) }] : []),
      ...(po.supplier_notes ? [{ title: 'Notes to maker', body: String(po.supplier_notes) }] : []),
    ],
    bank: null,
    showTerms: false,
    confidential: 'Confidential — supplier copy',
  }
}

export function purchaseOrderPdf(snapshot: Snap): Buffer {
  return renderDocument(buildPurchaseOrderModel(snapshot))
}
