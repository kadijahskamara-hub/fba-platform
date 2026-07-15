import 'server-only'
// ============================================================
// Sprint 5 — shared jsPDF document theme.
//
// A single drawing engine for every server-generated PDF. Each
// document family (commercial doc, invoice, PO, receipt, credit
// note, statement, delivery note) maps its frozen snapshot into a
// `DocModel` and calls `renderDocument`, so branding is identical
// everywhere and lives in one place.
//
// Brand parity with the Sprint-3.5 rebrand: forest green wordmark,
// serif (Times) headings, editorial A4 layout, footer with company
// identity, optional T&C page on client documents. Text wordmark
// (matches the existing tear-sheet / commercial-doc jsPDF pattern)
// rather than an embedded raster logo — deterministic and
// dependency-free.
//
// Money is formatted from major-unit numbers already present in the
// snapshots. Delivery notes set `noPrice` and carry NO money columns
// (the builder additionally deep-scans for forbidden fields).
// ============================================================

type RGB = [number, number, number]
const forest: RGB = [27, 67, 50]   // #1B4332
const ink:    RGB = [38, 32, 28]
// Darkened 15 Jul 2026 for print/screen readability (were #8A8278 / #A37043).
const stone:  RGB = [92, 82, 69]   // #5C5245 — secondary text
const caramel:RGB = [110, 82, 51]  // #6E5233 — accents / section labels
const line:   RGB = [223, 228, 222]

const W = 210, H = 297, M = 18
const BOTTOM = H - 20

export interface DocColumn { header: string; width: number; align?: 'left' | 'right' }

export interface DocModel {
  docLabel: string                       // 'QUOTATION', 'INVOICE', 'DELIVERY NOTE'…
  documentNumber: string
  subtitle?: string | null               // e.g. 'Revision 2', copy label
  metaRight: Array<[string, string]>     // dates etc, top-right
  company: {
    legal_name: string
    address?: string | null
    email?: string | null
    phone?: string | null
    vat_number?: string | null
    registration_number?: string | null
  }
  parties: Array<{ label: string; lines: string[] }>
  columns: DocColumn[]
  rows: Array<Array<string>>
  totals?: Array<[string, string, boolean?]>   // label, value, emphasised
  notes?: Array<{ title: string; body: string }>
  bank?: { bank_name?: string | null; account_name?: string | null; account_number?: string | null; sort_code?: string | null } | null
  qr?: { dataUri: string; url?: string | null; caption?: string } | null
  showTerms?: boolean
  watermark?: string | null
  confidential?: string
}

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' }

export function money(amount: number | null | undefined, currency = 'GBP'): string {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—'
  const sym = CURRENCY_SYMBOLS[currency] ?? `${currency} `
  const n = Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sym}${n}`
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function footer(doc: any, model: DocModel) {
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(...stone); doc.setLineWidth(0.2); doc.line(M, BOTTOM + 4, W - M, BOTTOM + 4)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...stone)
    const id = [model.company.legal_name, model.company.email].filter(Boolean).join(' · ')
    doc.text(id, M, BOTTOM + 9)
    doc.text(model.confidential ?? 'Confidential', W - M, BOTTOM + 9, { align: 'right' })
    doc.text(`Page ${p} of ${pages}`, W / 2, BOTTOM + 9, { align: 'center' })
  }
}

function watermark(doc: any, text: string) {
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('times', 'bold'); doc.setFontSize(64)
    doc.setTextColor(226, 232, 226)
    ;(doc as any).text(text, W / 2, H / 2, { align: 'center', angle: 32 })
  }
}

function ensure(doc: any, y: number, needed: number): number {
  if (y + needed > BOTTOM) { doc.addPage(); return 24 }
  return y
}

function header(doc: any, model: DocModel): number {
  // Wordmark
  doc.setFont('times', 'bold'); doc.setFontSize(19); doc.setTextColor(...forest)
  doc.text('Full Bloom Artelier', M, 22)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...stone); doc.setCharSpace(1.3)
  doc.text('DESIGN PROCUREMENT STUDIO, LONDON', M, 27)
  doc.setCharSpace(0)

  // Document label + number (right)
  doc.setFont('times', 'bold'); doc.setFontSize(15); doc.setTextColor(...ink)
  doc.text(model.docLabel.toUpperCase(), W - M, 21, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...caramel)
  doc.text(model.documentNumber, W - M, 27, { align: 'right' })
  if (model.subtitle) {
    doc.setFontSize(7.5); doc.setTextColor(...stone)
    doc.text(model.subtitle, W - M, 31.5, { align: 'right' })
  }

  doc.setDrawColor(...forest); doc.setLineWidth(0.6); doc.line(M, 35, W - M, 35)

  // Meta rows (right column) + company identity (left)
  let yL = 43
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...ink)
  const c = model.company
  const idLines = [
    c.legal_name,
    ...(c.address ? String(c.address).split('\n') : []),
    c.registration_number ? `Reg. no. ${c.registration_number}` : '',
    c.vat_number ? `VAT ${c.vat_number}` : '',
    [c.email, c.phone].filter(Boolean).join(' · '),
  ].filter(Boolean)
  for (const ln of idLines) { doc.text(String(ln), M, yL); yL += 4.4 }

  let yR = 43
  for (const [k, v] of model.metaRight) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...stone); doc.setCharSpace(0.4)
    doc.text(k.toUpperCase(), W - M - 44, yR); doc.setCharSpace(0)
    doc.setFontSize(8.5); doc.setTextColor(...ink)
    doc.text(String(v), W - M, yR, { align: 'right' })
    yR += 5
  }
  return Math.max(yL, yR) + 4
}

function parties(doc: any, model: DocModel, y: number): number {
  if (!model.parties.length) return y
  y = ensure(doc, y, 8 + model.parties.length * 4)
  const colW = (W - M * 2) / Math.min(model.parties.length, 3)
  let maxY = y
  model.parties.forEach((party, i) => {
    const x = M + colW * (i % 3)
    let py = y
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...caramel); doc.setCharSpace(0.5)
    doc.text(party.label.toUpperCase(), x, py); doc.setCharSpace(0); py += 5
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...ink)
    for (const ln of party.lines.filter(Boolean)) {
      const wrapped = doc.splitTextToSize(String(ln), colW - 4)
      doc.text(wrapped, x, py); py += wrapped.length * 4.4
    }
    maxY = Math.max(maxY, py)
  })
  return maxY + 5
}

function table(doc: any, model: DocModel, y: number): number {
  const cols = model.columns
  const totalW = W - M * 2
  const widthSum = cols.reduce((s, c) => s + c.width, 0)
  const scale = totalW / widthSum
  const xs: number[] = []
  let acc = M
  for (const c of cols) { xs.push(acc); acc += c.width * scale }

  const drawHead = (yy: number) => {
    doc.setFillColor(...forest); doc.rect(M, yy - 4.5, totalW, 7, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255)
    cols.forEach((c, i) => {
      const cw = c.width * scale
      const tx = c.align === 'right' ? xs[i] + cw - 2 : xs[i] + 2
      doc.text(c.header.toUpperCase(), tx, yy, { align: c.align === 'right' ? 'right' : 'left' })
    })
    return yy + 5.5
  }

  y = ensure(doc, y, 16)
  y = drawHead(y)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...ink)

  for (const row of model.rows) {
    // measure row height from wrapped cell text
    const cellLines = row.map((cell, i) => {
      const cw = cols[i].width * scale
      doc.setFontSize(8)
      return doc.splitTextToSize(String(cell ?? ''), cw - 4)
    })
    const rowH = Math.max(6, ...cellLines.map(l => l.length * 4.2 + 2))
    if (y + rowH > BOTTOM) { doc.addPage(); y = drawHead(24); doc.setFont('helvetica', 'normal'); doc.setTextColor(...ink) }
    doc.setFontSize(8)
    cols.forEach((c, i) => {
      const cw = c.width * scale
      const tx = c.align === 'right' ? xs[i] + cw - 2 : xs[i] + 2
      doc.text(cellLines[i], tx, y + 1.5, { align: c.align === 'right' ? 'right' : 'left' })
    })
    doc.setDrawColor(...line); doc.setLineWidth(0.2); doc.line(M, y + rowH - 2.5, W - M, y + rowH - 2.5)
    y += rowH
  }
  return y + 4
}

function totals(doc: any, model: DocModel, y: number): number {
  if (!model.totals?.length) return y
  const boxW = 74, x = W - M - boxW
  y = ensure(doc, y, model.totals.length * 6 + 6)
  for (const [label, value, emph] of model.totals) {
    doc.setFont('helvetica', emph ? 'bold' : 'normal'); doc.setFontSize(emph ? 9.5 : 8.5)
    doc.setTextColor(...(emph ? forest : ink))
    doc.text(label, x, y)
    doc.text(value, W - M, y, { align: 'right' })
    if (emph) { doc.setDrawColor(...forest); doc.setLineWidth(0.4); doc.line(x, y - 4.5, W - M, y - 4.5) }
    y += emph ? 7 : 5.5
  }
  return y + 3
}

function notesAndBank(doc: any, model: DocModel, y: number): number {
  for (const n of model.notes ?? []) {
    if (!n.body) continue
    y = ensure(doc, y, 12)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...forest); doc.setCharSpace(0.5)
    doc.text(n.title.toUpperCase(), M, y); doc.setCharSpace(0); y += 5
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...ink); doc.setLineHeightFactor(1.4)
    const lines = doc.splitTextToSize(n.body, W - M * 2)
    for (const ln of lines) { y = ensure(doc, y, 5); doc.text(ln, M, y); y += 4.6 }
    doc.setLineHeightFactor(1.15); y += 3
  }
  if (model.bank && (model.bank.account_number || model.bank.bank_name)) {
    y = ensure(doc, y, 22)
    doc.setDrawColor(...line); doc.setLineWidth(0.3); doc.rect(M, y, W - M * 2, 18)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...caramel); doc.setCharSpace(0.5)
    doc.text('PAYMENT DETAILS', M + 3, y + 5); doc.setCharSpace(0)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...ink)
    const b = model.bank
    const bl = [
      b.bank_name ? `Bank: ${b.bank_name}` : '',
      b.account_name ? `Account: ${b.account_name}` : '',
      b.account_number ? `Account no.: ${b.account_number}` : '',
      b.sort_code ? `Sort code: ${b.sort_code}` : '',
    ].filter(Boolean)
    doc.text(bl.slice(0, 2).join('    '), M + 3, y + 10)
    doc.text(bl.slice(2).join('    '), M + 3, y + 14.5)
    y += 22
  }
  return y
}

function termsPage(doc: any, model: DocModel) {
  doc.addPage()
  doc.setFont('times', 'bold'); doc.setFontSize(13); doc.setTextColor(...forest)
  doc.text('Terms & Conditions', M, 24)
  doc.setDrawColor(...forest); doc.setLineWidth(0.4); doc.line(M, 27, W - M, 27)
  const terms = [
    ['Acceptance', 'This document is issued by Full Bloom Artelier. Prices and specification are as stated and, for quotations, valid until the date shown. Acceptance constitutes agreement to these terms.'],
    ['Payment', 'Unless otherwise agreed in writing, a deposit is payable on acceptance with the balance due per the payment terms stated. Bespoke and made-to-order items are non-refundable once production has commenced.'],
    ['Lead times & delivery', 'Lead times are estimates given in good faith and may vary with maker capacity and shipping. Risk passes on delivery; title passes on full payment.'],
    ['Variations', 'Any change to specification, quantity or finish may alter price and lead time and will be confirmed in a revised document.'],
    ['Liability', 'Nothing in these terms limits liability where it may not lawfully be limited. Full Bloom Artelier is not liable for indirect or consequential loss.'],
  ]
  let y = 34
  for (const [t, b] of terms) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...ink)
    doc.text(t, M, y); y += 5
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...ink); doc.setLineHeightFactor(1.45)
    const lines = doc.splitTextToSize(b, W - M * 2)
    for (const ln of lines) { y = ensure(doc, y, 5); doc.text(ln, M, y); y += 4.6 }
    doc.setLineHeightFactor(1.15); y += 3
  }
  void model
}

/** Render a DocModel to a PDF Buffer (application/pdf). */
export function renderDocument(model: DocModel): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { jsPDF } = require('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  doc.setProperties({ title: `${model.docLabel} ${model.documentNumber}`, author: model.company.legal_name, creator: 'Full Bloom Artelier' })

  let y = header(doc, model)
  y = parties(doc, model, y)
  y = table(doc, model, y)
  y = totals(doc, model, y)
  y = notesAndBank(doc, model, y)
  if (model.qr?.dataUri) {
    y = ensure(doc, y, 38)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...forest); doc.setCharSpace(0.5)
    doc.text((model.qr.caption ?? 'CONFIRM RECEIPT').toUpperCase(), M, y); doc.setCharSpace(0); y += 3
    try { doc.addImage(model.qr.dataUri, 'PNG', M, y, 30, 30) } catch { /* skip on failure */ }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...ink)
    doc.text('Scan the code or visit the link below to confirm delivery:', M + 34, y + 8)
    if (model.qr.url) {
      doc.setTextColor(...forest)
      doc.text(doc.splitTextToSize(String(model.qr.url), W - M - (M + 34)), M + 34, y + 13)
    }
    y += 34
  }
  if (model.showTerms) termsPage(doc, model)
  if (model.watermark) watermark(doc, model.watermark)
  footer(doc, model)

  const ab = doc.output('arraybuffer') as ArrayBuffer
  return Buffer.from(ab)
}
