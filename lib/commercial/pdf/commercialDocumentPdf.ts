import 'server-only'
import { renderDocument, money, type DocModel } from './theme'

// ============================================================
// Commercial documents (quote / pro forma / invoice / service
// invoice) rendered from a frozen issued_documents snapshot.
// Reads ONLY snapshot data — never the live proforma record.
// ============================================================

type Snap = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const LABELS: Record<string, string> = {
  quote: 'QUOTATION',
  proforma: 'PRO FORMA INVOICE',
  invoice: 'INVOICE',
  service_invoice: 'SERVICE INVOICE',
}

function addressLines(v: unknown): string[] {
  if (!v) return []
  return String(v).split('\n').map(s => s.trim()).filter(Boolean)
}

export function buildCommercialDocumentModel(snapshot: Snap): DocModel {
  const docType = String(snapshot.docType ?? 'quote')
  const header = (snapshot.header ?? {}) as Snap
  const settings = (snapshot.settings ?? {}) as Snap
  const totals = (snapshot.totals ?? {}) as Snap
  const currency = String(header.currency ?? 'GBP')
  const isQuote = docType === 'quote'

  const meta: Array<[string, string]> = []
  if (header.quote_date) meta.push(['Date', String(header.quote_date)])
  if (header.invoice_date) meta.push(['Invoice date', String(header.invoice_date)])
  if (isQuote && header.valid_until) meta.push(['Valid until', String(header.valid_until)])
  if (header.invoice_due_date) meta.push(['Due', String(header.invoice_due_date)])
  if (header.proforma_number) meta.push(['Pro forma', String(header.proforma_number)])
  if (header.project_name) meta.push(['Project', String(header.project_name)])

  const parties: DocModel['parties'] = []
  parties.push({
    label: isQuote ? 'Prepared for' : 'Bill to',
    lines: [
      header.client_name as string,
      header.client_company as string,
      ...addressLines(header.billing_address),
      header.client_email as string,
    ].filter(Boolean),
  })
  if (header.delivery_address) {
    parties.push({ label: 'Deliver to', lines: addressLines(header.delivery_address) })
  }

  const lines = (snapshot.lines ?? []) as Snap[]
  // Sprint 14: every configured selection and Custom Match specification
  // appears on the client document (client-facing fields only — the
  // snapshot's `internal` block is never rendered here).
  const rows = lines.map(l => {
    const selectionBits = [
      l.selected_finish && `Finishes: ${l.selected_finish}`,
      l.selected_fabric && `Fabric: ${l.selected_fabric}`,
      l.selected_size && `Size: ${l.selected_size}`,
    ].filter(Boolean).join(' · ')
    const cell = [
      [l.name, l.description, l.section].filter(Boolean).join(' — ').slice(0, 200),
      selectionBits,
      l.spec_details ? String(l.spec_details).slice(0, 700) : null,
    ].filter(Boolean).join('\n')
    return [
      cell,
      String(Number(l.quantity ?? 0)),
      money(l.selling_price_unit != null ? Number(l.selling_price_unit) : null, currency),
      l.tax_category ? String(l.tax_category) : '—',
      money(l.line_gross_total != null ? Number(l.line_gross_total) : null, currency),
    ]
  })

  const totalRows: DocModel['totals'] = []
  const push = (label: string, key: string, emph = false) => {
    if (totals[key] != null) totalRows.push([label, money(Number(totals[key]), currency), emph])
  }
  push('Subtotal (net)', 'netSubtotal')
  push('VAT', 'vatTotal')
  push('Total', 'grossTotal', true)
  if (totals.depositRequested != null && Number(totals.depositRequested) > 0) {
    totalRows.push(['Deposit due', money(Number(totals.depositRequested), currency), false])
  }
  if (totals.paymentsReceived != null && Number(totals.paymentsReceived) > 0) {
    totalRows.push(['Paid', money(-Number(totals.paymentsReceived), currency), false])
  }
  if (totals.balanceDue != null) totalRows.push(['Balance due', money(Number(totals.balanceDue), currency), true])

  const notes: DocModel['notes'] = []
  if (header.lead_time) notes.push({ title: 'Lead time', body: String(header.lead_time) })
  if (header.payment_terms) notes.push({ title: 'Payment terms', body: String(header.payment_terms) })
  if (header.delivery_notes) notes.push({ title: 'Delivery', body: String(header.delivery_notes) })
  if (header.notes) notes.push({ title: 'Notes', body: String(header.notes) })

  const showBank = !isQuote
  return {
    docLabel: LABELS[docType] ?? 'DOCUMENT',
    documentNumber: String(snapshot.documentNumber ?? ''),
    subtitle: Number(snapshot.revision ?? 1) > 1 ? `Revision ${snapshot.revision}` : null,
    metaRight: meta,
    company: {
      legal_name: String(settings.company_legal_name ?? 'Full Bloom Artelier'),
      address: settings.registered_address ?? null,
      email: settings.invoice_email ?? null,
      phone: settings.invoice_phone ?? null,
      vat_number: settings.vat_registered ? (settings.vat_number ?? null) : null,
      registration_number: settings.company_registration_number ?? null,
    },
    parties,
    columns: [
      { header: 'Description', width: 46 },
      { header: 'Qty', width: 8, align: 'right' },
      { header: 'Unit', width: 14, align: 'right' },
      { header: 'Tax', width: 10, align: 'right' },
      { header: 'Amount', width: 16, align: 'right' },
    ],
    rows,
    totals: totalRows,
    notes,
    bank: showBank ? {
      bank_name: settings.bank_name, account_name: settings.bank_account_name,
      account_number: settings.bank_account_number, sort_code: settings.bank_sort_code,
    } : null,
    showTerms: true,
    confidential: 'Confidential — for client use only',
  }
}

export function commercialDocumentPdf(snapshot: Snap): Buffer {
  return renderDocument(buildCommercialDocumentModel(snapshot))
}
