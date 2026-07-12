// ============================================================
// Data-driven commercial document renderer.
//
// Renders QUOTATION / PRO FORMA INVOICE / INVOICE / SERVICE
// INVOICE as a print-ready A4 HTML document from a frozen issue
// snapshot (see lib/commercial/snapshots.ts). Draft previews render
// from a snapshot-shaped object with a DRAFT watermark.
//
// Visual design follows the Full Bloom Artelier brand samples:
//   • FBA monogram logo (public/images/fba-logo-green.png), inlined.
//   • Large spaced-caps document title, Forest Green #1B4332.
//   • Borderless small-caps meta columns and section headings.
//   • Per-line monogram tile (product photo when available).
//   • Borderless right-aligned totals with a prominent "Amount Due".
//   • Terms & Conditions on a second page (client documents).
//
// Hard rules:
//  • No contenteditable anywhere. Figures come from the server.
//  • Client documents NEVER show supplier cost, margin, markup,
//    internal notes, or approval information.
// ============================================================

import fs from 'fs'
import path from 'path'
import { h } from '../proformaDocument'
import type { IssuedDocType } from './types'

interface SnapshotLine {
  id?: string
  line_type: string
  is_bespoke?: boolean
  name: string
  description: string | null
  section: string | null
  spec_details: string | null
  selected_finish: string | null
  selected_fabric: string | null
  selected_size: string | null
  image_url: string | null
  manufacturer_name?: string | null
  quantity: number
  unit_of_measure: string
  selling_price_unit: number | null
  discount_amount: number
  tax_category: string
  tax_rate_snapshot: number | null
  line_net_total: number | null
  line_tax_total: number | null
  line_gross_total: number | null
  client_notes: string | null
}

export interface DocumentSnapshot {
  docType: IssuedDocType
  documentNumber: string
  revision: number
  issuedAt: string
  header: Record<string, unknown>
  lines: SnapshotLine[]
  totals: Record<string, unknown>
  settings: Record<string, unknown>
}

export interface RenderDocOptions {
  draft?: boolean
  logEndpoint?: string
  logPayload?: Record<string, unknown>
}

function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }
function money(n: number | null | undefined, cur: string): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return `${sym(cur)}${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(d: unknown): string {
  if (!d || typeof d !== 'string') return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return h(d)
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function multiline(str: unknown): string {
  if (!str || typeof str !== 'string') return ''
  return h(str).replace(/\r?\n/g, '<br>')
}
/** First two letters of a name — matches the sample's monogram tiles. */
function monogram(name: string): string {
  const letters = (name || '').replace(/[^A-Za-z]/g, '')
  return (letters.slice(0, 2) || '—').toUpperCase()
}

const TAX_LABEL: Record<string, string> = {
  standard: 'Standard', reduced: 'Reduced', zero: 'Zero-rated', exempt: 'Exempt', outside_scope: 'Outside scope',
}

const DOC_META: Record<IssuedDocType, { title: string; disclaimer: string | null }> = {
  quote: { title: 'Quotation', disclaimer: 'This is not an invoice.' },
  proforma: { title: 'Pro Forma Invoice', disclaimer: 'This is not a VAT invoice.' },
  invoice: { title: 'Invoice', disclaimer: null },
  service_invoice: { title: 'Invoice', disclaimer: null },
}

// ── Terms & Conditions (client documents, second page) ─────
const TERMS: { heading: string; points: string[] }[] = [
  { heading: 'Scope & pricing', points: [
    'The goods and services listed on the face of this document form the basis of the commission. Prices are in the stated currency and exclude VAT unless shown.',
    'Full Bloom Artelier reserves the right to adjust quoted prices prior to order confirmation where exchange rates, material costs, or maker pricing change beyond our control.',
    'Third-party costs (delivery, installation, specialist consultants) are recharged at cost unless already itemised above.',
  ] },
  { heading: 'Deposits & payment', points: [
    'Unless otherwise agreed in writing, a deposit is required to confirm an order, with the balance due and cleared five working days before dispatch or delivery. Orders under £2,000 require full payment on confirmation.',
    'All goods remain the property of Full Bloom Artelier until payment has been received in full.',
    'We reserve the right to charge interest on overdue amounts and to pause production or delivery where payment is outstanding.',
  ] },
  { heading: 'Specifications & approvals', points: [
    'The client must verify all order details — materials, finishes, fabrics, dimensions, and quantities — before confirming. Confirmed specifications form the basis of the commission.',
    'Bespoke and made-to-order pieces are produced against the agreed specification and, where applicable, an approved Golden Sample. Each piece is accompanied by its Technical Passport™.',
  ] },
  { heading: 'Changes, lead times & delivery', points: [
    'Because our pieces are made to order by independent makers, changes or cancellations requested more than 48 hours after order confirmation may incur costs, which are the client’s responsibility.',
    'Lead times are estimates given in good faith and depend on maker capacity and material availability; they are not guaranteed dates.',
    'The client is responsible for ensuring the delivery site is ready and accessible. Additional costs from failed, delayed, or restricted deliveries are charged at cost.',
  ] },
  { heading: 'Guarantee', points: [
    'Full Bloom Artelier guarantees supplied pieces against manufacturing faults for 12 months from delivery.',
    'The guarantee is conditional on reasonable care in line with the piece’s Technical Passport™, and excludes fair wear and tear, misuse, and client-altered items.',
  ] },
]

// ── Inlined brand logo (cached) ────────────────────────────
let _logo: string | null | undefined
function logoDataUri(): string | null {
  if (_logo !== undefined) return _logo
  try {
    const p = path.join(process.cwd(), 'public', 'images', 'fba-logo-green.png')
    if (fs.existsSync(p)) { _logo = `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`; return _logo }
  } catch { /* fall through to text wordmark */ }
  _logo = null
  return _logo
}

export function documentFilename(snap: DocumentSnapshot): string {
  const head = snap.header
  const context = (head.client_company ?? head.client_name ?? head.project_name ?? 'Client') as string
  const slug = context.replace(/[^A-Za-z0-9]+/g, '').slice(0, 40) || 'Client'
  const type = snap.docType === 'quote' ? 'Quotation' : snap.docType === 'proforma' ? 'Proforma' : snap.docType === 'service_invoice' ? 'ServiceInvoice' : 'Invoice'
  const ym = new Date().toISOString().slice(0, 7)
  return `FBA_${type}_${slug}_${ym}`
}

export function renderCommercialDocument(snap: DocumentSnapshot, opts: RenderDocOptions = {}): string {
  const head = snap.header
  const settings = snap.settings
  const totals = snap.totals ?? {}
  const cur = (head.currency as string) ?? 'GBP'
  const meta = DOC_META[snap.docType]
  const filename = documentFilename(snap)
  const isServiceInvoice = snap.docType === 'service_invoice'
  const isInvoice = snap.docType === 'invoice' || isServiceInvoice
  const isQuote = snap.docType === 'quote'
  const logo = logoDataUri()

  const lines = isServiceInvoice ? snap.lines.filter(l => l.line_type !== 'product') : snap.lines
  const productLines = lines.filter(l => l.line_type === 'product')
  const serviceLines = lines.filter(l => l.line_type === 'service')
  const otherLines = lines.filter(l => !['product', 'service'].includes(l.line_type))

  const specHtml = (it: SnapshotLine): string => {
    const parts: string[] = []
    if (it.description) parts.push(multiline(it.description))
    if (it.selected_size) parts.push(`<span class="spec-label">Size:</span> ${h(it.selected_size)}`)
    if (it.selected_finish) parts.push(`<span class="spec-label">Finish:</span> ${h(it.selected_finish)}`)
    if (it.selected_fabric) parts.push(`<span class="spec-label">Fabric / Upholstery:</span> ${h(it.selected_fabric)}`)
    if (it.spec_details) parts.push(multiline(it.spec_details))
    if (it.client_notes) parts.push(`<span class="item-note"><span class="spec-label">Note:</span> ${multiline(it.client_notes)}</span>`)
    return parts.join('<br>')
  }

  const tile = (it: SnapshotLine): string =>
    it.image_url
      ? `<div class="tile"><img src="${h(it.image_url)}" alt=""></div>`
      : `<div class="tile mono">${h(monogram(it.name))}</div>`

  const itemsTable = (items: SnapshotLine[], heading: string, opts2: { unitCol?: boolean } = {}): string => {
    if (items.length === 0) return ''
    const sections = new Map<string, SnapshotLine[]>()
    for (const it of items) {
      const key = (it.section || '').trim() || heading
      if (!sections.has(key)) sections.set(key, [])
      sections.get(key)!.push(it)
    }
    return [...sections.entries()].map(([name, secItems]) => {
      const rows = secItems.map(it => `
      <tr>
        <td class="c-item">
          ${tile(it)}
          <div class="item-name">${h(it.name)}${it.is_bespoke ? ' <span class="bespoke">Bespoke</span>' : ''}</div>
        </td>
        <td class="c-spec">${specHtml(it) || '<span class="muted">—</span>'}</td>
        <td class="c-qty">${h(it.quantity)}${opts2.unitCol && it.unit_of_measure && it.unit_of_measure !== 'each' ? `<br><span class="muted" style="font-size:7.5pt">${h(it.unit_of_measure)}</span>` : ''}</td>
        <td class="c-num">${money(it.selling_price_unit, cur)}</td>
        <td class="c-num">${it.tax_rate_snapshot != null && it.tax_rate_snapshot > 0 ? `${h(it.tax_rate_snapshot)}%` : h(TAX_LABEL[it.tax_category] ?? it.tax_category)}</td>
        <td class="c-num bold">${it.discount_amount > 0 ? `−${money(it.discount_amount, cur)}<br>` : ''}${money(it.line_net_total, cur)}</td>
      </tr>`).join('')
      return `
    <div class="section-head">${h(name)}</div>
    <table class="items">
      <thead>
        <tr><th class="c-item">Item</th><th class="c-spec">Description</th><th class="c-qty">Qty</th><th class="c-num">Unit Price</th><th class="c-num">VAT</th><th class="c-num">Amount</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
    }).join('')
  }

  // ── Totals ──
  const num = (k: string): number | null => {
    const v = totals[k]
    return v === null || v === undefined ? null : Number(v)
  }
  // effective single VAT rate label, if all taxable lines share one
  const rates = new Set(lines.filter(l => (l.tax_rate_snapshot ?? 0) > 0).map(l => Number(l.tax_rate_snapshot)))
  const vatLabel = rates.size === 1 ? `VAT (${[...rates][0]}%)` : 'VAT'

  type Trow = { k: string; v: string; grand?: boolean; big?: boolean }
  const trows: Trow[] = []
  if (productLines.length > 0 && !isServiceInvoice) trows.push({ k: 'Products (ex VAT)', v: money(num('productSellingSubtotal'), cur) })
  if (serviceLines.length > 0) trows.push({ k: 'Services (ex VAT)', v: money(num('serviceSubtotal'), cur) })
  if (otherLines.length > 0) trows.push({ k: 'Delivery / other charges (ex VAT)', v: money(num('otherChargesSubtotal'), cur) })
  if ((num('discountTotal') ?? 0) > 0) trows.push({ k: 'Discounts applied', v: `−${money(num('discountTotal'), cur)}` })
  if ((num('procurementFee') ?? 0) > 0) trows.push({ k: 'Procurement fee', v: money(num('procurementFee'), cur) })
  trows.push({ k: 'Subtotal (ex VAT)', v: money(num('netSubtotal'), cur) })
  trows.push({ k: vatLabel, v: money(num('vatTotal'), cur) })
  trows.push({ k: 'Total', v: money(num('grossTotal'), cur), grand: true })
  if (isInvoice) {
    if ((num('paymentsReceived') ?? 0) > 0) trows.push({ k: 'Less: payments received', v: `−${money(num('paymentsReceived'), cur)}` })
    trows.push({ k: 'Amount due', v: money(num('balanceDue'), cur), big: true })
  } else {
    trows.push({ k: `Deposit requested (${h(head.deposit_percent)}%)`, v: money(num('depositRequested'), cur) })
    trows.push({ k: 'Balance following deposit', v: money((num('grossTotal') ?? 0) - (num('depositRequested') ?? 0), cur) })
  }
  const totalsBlock = `
    <table class="totals">
      ${trows.map(r => `<tr class="${r.grand ? 'grand' : ''}${r.big ? ' big' : ''}"><td>${r.k}</td><td class="c-num">${r.v}</td></tr>`).join('')}
    </table>`

  // ── Meta columns ──
  const metaCols: [string, string][] = []
  if (isQuote) {
    metaCols.push(['Quote Number', h(snap.documentNumber)])
    metaCols.push(['Issue Date', fmtDate(snap.issuedAt)])
    metaCols.push(['Valid Until', fmtDate(head.valid_until)])
    if (snap.revision > 1) metaCols.push(['Revision', `R${String(snap.revision).padStart(2, '0')}`])
  } else if (snap.docType === 'proforma') {
    metaCols.push(['Proforma Number', h(snap.documentNumber)])
    metaCols.push(['Date', fmtDate(snap.issuedAt)])
    metaCols.push(['Valid Until', fmtDate(head.valid_until)])
    if (head.quote_number) metaCols.push(['Quote Reference', `${h(head.quote_number)}${snap.revision > 1 ? ` · R${String(snap.revision).padStart(2, '0')}` : ''}`])
  } else {
    metaCols.push(['Invoice Number', h(snap.documentNumber)])
    metaCols.push(['Issue Date', fmtDate(head.invoice_date ?? snap.issuedAt)])
    metaCols.push(['Due Date', fmtDate(head.invoice_due_date)])
    if (head.quote_number) metaCols.push(['Quote Reference', h(head.quote_number)])
    if (!isServiceInvoice && head.proforma_number) metaCols.push(['Proforma Reference', h(head.proforma_number)])
  }

  // ── Payment & delivery detail ──
  const detailRows: [string, string][] = []
  if (isQuote) detailRows.push(['Lead Time', multiline(head.lead_time) || '—'])
  detailRows.push(['Payment Terms', multiline(head.payment_terms ?? settings.default_payment_terms) || '—'])
  const bankKnown = settings.bank_name || settings.bank_account_number
  if (!isQuote && bankKnown) {
    detailRows.push(['Bank Account',
      `${h(settings.bank_name ?? '')}${settings.bank_account_name ? ` &nbsp;·&nbsp; ${h(settings.bank_account_name)}` : ''} &nbsp;·&nbsp; Account No: ${h(settings.bank_account_number ?? '—')} &nbsp;·&nbsp; Sort Code: ${h(settings.bank_sort_code ?? '—')}<br><em>Please use “${h(snap.documentNumber)}” as the payment reference.</em>`])
  }
  if (head.delivery_notes) detailRows.push(['Delivery', multiline(head.delivery_notes)])
  if (head.notes) detailRows.push(['Notes', multiline(head.notes)])

  const contact = [settings.invoice_email, settings.phone].filter(Boolean).map(x => h(x)).join(' · ')

  const watermark = opts.draft ? `<div class="watermark">DRAFT — NOT ISSUED</div>` : ''
  const disclaimer = meta.disclaimer ? `<span class="disclaimer">${h(meta.disclaimer)}</span>` : ''
  const logoHtml = logo
    ? `<img class="logo" src="${logo}" alt="Full Bloom Artelier">`
    : `<div class="logo-text">Full Bloom Artelier</div>`

  const termsBlock = isQuote || snap.docType === 'proforma' || isInvoice ? `
  <section class="terms">
    <div class="doc-header">
      <div>
        <h1 class="title">Terms &amp; Conditions</h1>
        <div class="subtitle">Full Bloom Artelier · ${h(meta.title)}</div>
      </div>
      ${logoHtml}
    </div>
    <div class="hr"></div>
    <p class="terms-intro">Within these terms, “Full Bloom Artelier”, “FBA”, and “we” mean Full Bloom Artelier and “the client” means our contractual counterparty. These terms apply in addition to any terms stated on the face of this document.</p>
    ${TERMS.map(t => `
      <div class="terms-group">
        <div class="terms-heading">${h(t.heading)}</div>
        <ul>${t.points.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>`).join('')}
  </section>` : ''

  const logScript = opts.logEndpoint ? `
<script>
  var FBA_LOG = { endpoint: ${JSON.stringify(opts.logEndpoint)}, payload: ${JSON.stringify(opts.logPayload ?? {})} };
  async function fbaDownload() {
    try {
      await fetch(FBA_LOG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(FBA_LOG.payload) })
    } catch (e) { /* logging must never block the download */ }
    window.print()
  }
</script>` : `<script>function fbaDownload(){window.print()}</script>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${h(filename)}</title>
<style>
  :root {
    --forest: #1B4332; --forest-soft: #3f5f52; --offwhite: #FAFAF8;
    --midgrey: #D9D9D2; --body: #4a4a45; --light: #9a968c; --tint: #EDF2EE;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { background: #EFEFEA; }
  body { font-family: Georgia, 'Times New Roman', serif; color: var(--body); font-size: 9.5pt; line-height: 1.5; }
  @page { size: A4; margin: 18mm 18mm 20mm; }
  .sheet { max-width: 190mm; margin: 0 auto; background: #fff; padding: 16mm 16mm; position: relative; }
  @media print {
    html { background: #fff; }
    .sheet { max-width: none; padding: 0; }
    .toolbar { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .terms { break-before: page; }
  }
  .toolbar { position: sticky; top: 0; z-index: 10; background: var(--forest); color: #fff; padding: 10px 16px; display: flex; align-items: center; gap: 14px; font-size: 12px; font-family: Georgia, serif; }
  .toolbar .fn { opacity: 0.75; letter-spacing: 0.06em; }
  .toolbar button { margin-left: auto; background: #fff; color: var(--forest); border: none; font-family: Georgia, serif; font-size: 13px; padding: 8px 18px; cursor: pointer; letter-spacing: 0.08em; }

  .watermark { position: absolute; top: 42%; left: 0; right: 0; text-align: center; transform: rotate(-24deg); font-size: 40pt; letter-spacing: 0.3em; color: rgba(160,48,48,0.12); pointer-events: none; z-index: 5; }

  /* Header */
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .title { font-size: 27pt; font-weight: normal; letter-spacing: 0.14em; text-transform: uppercase; color: var(--forest); line-height: 1; }
  .subtitle { font-size: 8pt; letter-spacing: 0.24em; text-transform: uppercase; color: var(--light); margin-top: 8px; }
  .logo { width: 42mm; height: auto; }
  .logo-text { font-size: 15pt; letter-spacing: 0.2em; text-transform: uppercase; color: var(--forest); text-align: right; }
  .hr { border-top: 0.75pt solid var(--forest); margin: 12px 0 18px; }

  /* Meta columns */
  .meta { display: flex; gap: 34px; flex-wrap: wrap; margin-bottom: 20px; }
  .meta .m .k, .lbl { font-size: 7.5pt; letter-spacing: 0.14em; text-transform: uppercase; color: var(--light); display: block; margin-bottom: 3px; }
  .meta .m .v { font-size: 10.5pt; color: var(--forest); }

  /* Address grid */
  .addr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 34px; margin-bottom: 8px; }
  .addr .name { font-size: 10.5pt; color: var(--forest); font-weight: bold; margin-bottom: 2px; }
  .addr .val { font-size: 9.5pt; color: var(--body); }
  .contact-line { font-size: 8.5pt; color: var(--body); margin: 2px 0 20px; }

  .disclaimer { display: inline-block; background: var(--tint); color: var(--forest); font-size: 8pt; letter-spacing: 0.16em; text-transform: uppercase; padding: 4px 12px; margin-bottom: 18px; }

  /* Section heading */
  .section-head { font-size: 8.5pt; letter-spacing: 0.18em; text-transform: uppercase; color: var(--forest-soft); border-bottom: 0.5pt solid var(--midgrey); padding-bottom: 5px; margin: 26px 0 4px; }

  /* Items */
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.items th { font-size: 7.5pt; letter-spacing: 0.14em; text-transform: uppercase; color: var(--light); text-align: left; padding: 8px 8px; border-bottom: 0.5pt solid var(--midgrey); font-weight: normal; }
  table.items td { padding: 12px 8px; border-bottom: 0.5pt solid #ECEAE3; vertical-align: top; font-size: 9pt; }
  table.items tr { page-break-inside: avoid; }
  .c-item { width: 42mm; }
  .c-spec { color: var(--body); }
  .c-qty { width: 12mm; text-align: center; }
  .c-num { width: 22mm; text-align: right; white-space: nowrap; }
  th.c-qty { text-align: center; } th.c-num { text-align: right; }
  .bold { color: var(--forest); }
  .tile { width: 15mm; height: 15mm; border: 0.5pt solid var(--midgrey); margin-bottom: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #fff; }
  .tile.mono { color: var(--forest); font-size: 12pt; letter-spacing: 0.08em; }
  .tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .item-name { color: var(--forest); font-size: 9.5pt; }
  .bespoke { font-size: 7pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--light); }
  .spec-label { font-size: 8pt; letter-spacing: 0.05em; text-transform: uppercase; color: var(--light); }
  .item-note { display: inline-block; background: var(--tint); padding: 2px 6px; margin-top: 3px; color: var(--forest); }
  .muted { color: var(--light); }

  /* Totals */
  table.totals { border-collapse: collapse; margin: 20px 0 4px auto; min-width: 84mm; }
  table.totals td { padding: 6px 4px; font-size: 9.5pt; }
  table.totals td:first-child { font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: var(--body); padding-right: 28px; }
  table.totals td.c-num { text-align: right; color: var(--forest); }
  table.totals tr.grand td { border-top: 1pt solid var(--forest); padding-top: 9px; font-weight: bold; }
  table.totals tr.grand td:first-child { color: var(--forest); }
  table.totals tr.big td { font-size: 14pt; color: var(--forest-soft); border-top: 0.5pt solid var(--midgrey); padding-top: 9px; }
  table.totals tr.big td:first-child { color: var(--forest-soft); font-size: 9pt; }

  /* Payment / notes */
  .pay { margin-top: 26px; }
  .pay .blk { margin-bottom: 12px; }
  .pay .val { font-size: 9.5pt; color: var(--body); }
  .notes-box { border: 0.5pt solid var(--midgrey); padding: 12px 14px; font-size: 9.5pt; color: var(--body); }

  .doc-footer { margin-top: 30px; padding-top: 8px; border-top: 0.5pt solid var(--midgrey); font-size: 7.5pt; letter-spacing: 0.04em; color: var(--light); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; }

  /* Terms page */
  .terms { margin-top: 30px; }
  .terms-intro { font-size: 8.5pt; color: var(--light); margin: 2px 0 16px; }
  .terms-group { margin-bottom: 12px; page-break-inside: avoid; }
  .terms-heading { font-size: 8.5pt; letter-spacing: 0.14em; text-transform: uppercase; color: var(--forest); margin-bottom: 5px; }
  .terms ul { list-style: none; }
  .terms li { font-size: 8.5pt; margin-bottom: 4px; padding-left: 14px; position: relative; }
  .terms li::before { content: "—"; position: absolute; left: 0; color: var(--light); }
</style>
</head>
<body>
<div class="toolbar">
  <span>Use “Download PDF”, then choose <strong>Save as PDF</strong> in the print dialogue.</span>
  <span class="fn">${h(filename)}.pdf</span>
  <button onclick="fbaDownload()">Download PDF</button>
</div>
<div class="sheet">
  ${watermark}

  <div class="doc-header">
    <div>
      <div class="title">${h(meta.title)}</div>
      <div class="subtitle">Full Bloom Artelier · Design Procurement Studio, London</div>
    </div>
    ${logoHtml}
  </div>
  <div class="hr"></div>

  <div class="meta">
    ${metaCols.map(([k, v]) => `<div class="m"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}
  </div>

  <div class="addr-grid">
    <div class="addr">
      <span class="lbl">Bill To</span>
      <div class="name">${h(head.client_company || head.client_name) || '—'}</div>
      ${head.client_company && head.client_name ? `<div class="val">${h(head.client_name)}</div>` : ''}
      ${head.billing_address ? `<div class="val">${multiline(head.billing_address)}</div>` : ''}
      ${head.client_email ? `<div class="val">${h(head.client_email)}</div>` : ''}
    </div>
    <div class="addr">
      <span class="lbl">Project</span>
      <div class="name">${h(head.project_name) || '—'}</div>
      ${head.project_location ? `<div class="val">${h(head.project_location)}</div>` : ''}
      ${head.delivery_address ? `<div class="val">${multiline(head.delivery_address)}</div>` : ''}
    </div>
  </div>
  ${contact ? `<div class="contact-line"><span class="lbl" style="display:inline">Contact</span> &nbsp; ${contact}</div>` : '<div style="margin-bottom:20px"></div>'}

  ${disclaimer}

  ${isServiceInvoice ? '' : itemsTable(productLines, 'Products')}
  ${itemsTable(serviceLines, isServiceInvoice ? 'Services' : 'Professional Services', { unitCol: true })}
  ${itemsTable(otherLines, 'Delivery & Other Charges', { unitCol: true })}
  ${lines.length === 0 ? '<p class="muted">No line items.</p>' : ''}

  ${totalsBlock}

  ${detailRows.length ? `
  <div class="pay">
    ${detailRows.map(([k, v]) => `<div class="blk"><span class="lbl">${k}</span>${k === 'Notes' ? `<div class="notes-box">${v}</div>` : `<div class="val">${v}</div>`}</div>`).join('')}
  </div>` : ''}

  <div class="doc-footer">
    <span>${h(settings.company_legal_name ?? 'Full Bloom Artelier')} · ${h(meta.title)} ${h(snap.documentNumber)} · fullbloom.uk.com · ${h(settings.invoice_email ?? '')}</span>
    <span>${settings.company_registration_number ? `Company No: ${h(settings.company_registration_number)} · ` : ''}${settings.vat_number ? `VAT No: ${h(settings.vat_number)}` : ''}</span>
  </div>

  ${termsBlock}
</div>
${logScript}
</body>
</html>`
}
