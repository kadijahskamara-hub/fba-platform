// ============================================================
// Data-driven commercial document renderer.
//
// Renders QUOTATION / PRO FORMA INVOICE / INVOICE / SERVICE
// INVOICE as print-ready A4 HTML from a frozen issue snapshot
// (see lib/commercial/snapshots.ts). Draft previews render from
// a snapshot-shaped object with a DRAFT watermark.
//
// Hard rules:
//  • No contenteditable anywhere. Figures come from the server.
//  • Client documents NEVER show supplier cost, margin, markup,
//    internal notes, or approval information.
//  • Brand: Georgia serif, Forest Green #1B4332, off-white label
//    tables, spaced-caps section headings (FBA guidelines).
// ============================================================

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
const TAX_LABEL: Record<string, string> = {
  standard: 'Standard', reduced: 'Reduced', zero: 'Zero-rated', exempt: 'Exempt', outside_scope: 'Outside scope',
}

const DOC_META: Record<IssuedDocType, { title: string; disclaimer: string | null }> = {
  quote: { title: 'Quotation', disclaimer: 'This is not an invoice.' },
  proforma: { title: 'Pro Forma Invoice', disclaimer: 'This is not a VAT invoice.' },
  invoice: { title: 'Invoice', disclaimer: null },
  service_invoice: { title: 'Invoice', disclaimer: null },
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

  // Client-safe lines only — internal figures are intentionally not read
  // even if present in the snapshot.
  const lines = isServiceInvoice ? snap.lines.filter(l => l.line_type !== 'product') : snap.lines

  // ── Group by section, keeping products / services / other apart ──
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

  const itemsTable = (items: SnapshotLine[], heading: string, opts2: { unitCol?: boolean } = {}): string => {
    if (items.length === 0) return ''
    // sub-group by section
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
          ${it.image_url ? `<img class="thumb" src="${h(it.image_url)}" alt="">` : ''}
          <div class="item-name">${h(it.name)}${it.is_bespoke ? ' <span class="bespoke">Bespoke</span>' : ''}</div>
        </td>
        <td class="c-spec">${specHtml(it) || '<span class="muted">—</span>'}</td>
        <td class="c-qty">${h(it.quantity)}${opts2.unitCol && it.unit_of_measure && it.unit_of_measure !== 'each' ? `<br><span class="muted" style="font-size:7.5pt">${h(it.unit_of_measure)}</span>` : ''}</td>
        <td class="c-num">${money(it.selling_price_unit, cur)}</td>
        <td class="c-num">${it.tax_rate_snapshot != null && it.tax_rate_snapshot > 0 ? `${h(it.tax_rate_snapshot)}%` : h(TAX_LABEL[it.tax_category] ?? it.tax_category)}</td>
        <td class="c-num">${it.discount_amount > 0 ? `−${money(it.discount_amount, cur)}<br>` : ''}${money(it.line_net_total, cur)}</td>
      </tr>`).join('')
      return `
    <div class="section-head">${h(name)}</div>
    <table class="items">
      <thead>
        <tr><th class="c-item">Item</th><th class="c-spec">Specification</th><th class="c-qty">Qty</th><th class="c-num">Unit Price</th><th class="c-num">VAT</th><th class="c-num">Total (ex VAT)</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
    }).join('')
  }

  // ── Totals block ──
  const num = (k: string): number | null => {
    const v = totals[k]
    return v === null || v === undefined ? null : Number(v)
  }
  const rows: Array<[string, string, boolean]> = []
  if (productLines.length > 0 && !isServiceInvoice) rows.push(['Products (ex VAT)', money(num('productSellingSubtotal'), cur), false])
  if (serviceLines.length > 0) rows.push(['Services (ex VAT)', money(num('serviceSubtotal'), cur), false])
  if (otherLines.length > 0) rows.push(['Delivery / other charges (ex VAT)', money(num('otherChargesSubtotal'), cur), false])
  if ((num('discountTotal') ?? 0) > 0) rows.push(['Discounts applied', `−${money(num('discountTotal'), cur)}`, false])
  if ((num('procurementFee') ?? 0) > 0) rows.push(['Procurement fee', money(num('procurementFee'), cur), false])
  rows.push(['Net subtotal', money(num('netSubtotal'), cur), false])
  rows.push([`VAT`, money(num('vatTotal'), cur), false])
  rows.push(['Total', money(num('grossTotal'), cur), true])
  if (isInvoice) {
    if ((num('paymentsReceived') ?? 0) > 0) rows.push(['Payments received', `−${money(num('paymentsReceived'), cur)}`, false])
    rows.push(['Balance due', money(num('balanceDue'), cur), true])
  } else {
    rows.push([`Deposit requested (${h(head.deposit_percent)}%)`, money(num('depositRequested'), cur), false])
    rows.push(['Balance following deposit', money((num('grossTotal') ?? 0) - (num('depositRequested') ?? 0), cur), false])
  }
  const totalsBlock = `
    <table class="totals">
      ${rows.map(([k, v, grand]) => `<tr${grand ? ' class="grand"' : ''}><td>${k}</td><td class="c-num">${v}</td></tr>`).join('')}
    </table>`

  // ── Meta rows ──
  const metaRows: [string, string][] = []
  if (isQuote) {
    metaRows.push(['Quote Number', h(snap.documentNumber)])
    if (snap.revision > 1) metaRows.push(['Revision', `R${String(snap.revision).padStart(2, '0')}`])
    metaRows.push(['Issue Date', fmtDate(snap.issuedAt)])
    metaRows.push(['Valid Until', fmtDate(head.valid_until)])
  } else if (snap.docType === 'proforma') {
    metaRows.push(['Proforma Number', h(snap.documentNumber)])
    if (head.quote_number) metaRows.push(['Quote Reference', `${h(head.quote_number)}${snap.revision > 1 ? ` · R${String(snap.revision).padStart(2, '0')}` : ''}`])
    metaRows.push(['Date', fmtDate(snap.issuedAt)])
    metaRows.push(['Valid Until', fmtDate(head.valid_until)])
  } else {
    metaRows.push(['Invoice Number', h(snap.documentNumber)])
    metaRows.push(['Invoice Date', fmtDate(head.invoice_date ?? snap.issuedAt)])
    metaRows.push(['Payment Due', fmtDate(head.invoice_due_date)])
    if (head.quote_number) metaRows.push(['Quote Reference', h(head.quote_number)])
    if (!isServiceInvoice) metaRows.push(['Proforma Reference', h(head.proforma_number)])
  }

  // ── Payment & delivery details ──
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

  const watermark = opts.draft ? `<div class="watermark">DRAFT — NOT ISSUED</div>` : ''
  const disclaimer = meta.disclaimer ? `<div class="disclaimer">${h(meta.disclaimer)}</div>` : ''

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
    --forest: #1B4332; --offwhite: #FAFAF8; --white: #FFFFFF;
    --midgrey: #C8C8C0; --body: #555550; --light: #888880; --tint: #E8F0EB;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { background: #EFEFEA; }
  body { font-family: Georgia, 'Times New Roman', serif; color: var(--body); font-size: 9.5pt; line-height: 1.45; }
  @page { size: A4; margin: 21mm 20mm 25mm; }
  .sheet { max-width: 180mm; margin: 0 auto; background: var(--white); padding: 14mm 12mm; position: relative; }
  @media print {
    html { background: var(--white); }
    .sheet { max-width: none; padding: 0; }
    .toolbar { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  .toolbar { position: sticky; top: 0; z-index: 10; background: var(--forest); color: #fff; padding: 10px 16px; display: flex; align-items: center; gap: 14px; font-size: 12px; }
  .toolbar .fn { opacity: 0.75; letter-spacing: 0.06em; }
  .toolbar button { margin-left: auto; background: #fff; color: var(--forest); border: none; font-family: Georgia, serif; font-size: 13px; padding: 8px 18px; cursor: pointer; letter-spacing: 0.08em; }
  .toolbar button:hover { background: var(--tint); }
  .watermark { position: absolute; top: 40%; left: 0; right: 0; text-align: center; transform: rotate(-24deg); font-size: 34pt; letter-spacing: 0.3em; color: rgba(160,48,48,0.15); pointer-events: none; z-index: 5; }
  .doc-header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5px solid var(--forest); padding-bottom: 10px; }
  .wordmark { font-size: 15pt; letter-spacing: 0.32em; text-transform: uppercase; color: var(--forest); }
  .wordmark small { display: block; font-size: 7.5pt; letter-spacing: 0.22em; color: var(--light); font-style: italic; margin-top: 3px; text-transform: none; }
  .doc-type { font-size: 9pt; letter-spacing: 0.3em; text-transform: uppercase; color: var(--forest); text-align: right; }
  h1.title { font-size: 26pt; font-weight: normal; color: var(--forest); margin: 26px 0 2px; }
  .subtitle { font-size: 10pt; font-style: italic; color: var(--body); margin-bottom: 6px; }
  .disclaimer { display: inline-block; background: var(--tint); color: var(--forest); font-size: 8pt; letter-spacing: 0.14em; text-transform: uppercase; padding: 4px 10px; margin-bottom: 16px; }
  table.kv { width: 100%; border-collapse: collapse; border-top: 0.5pt solid var(--midgrey); border-bottom: 0.5pt solid var(--midgrey); margin-bottom: 18px; }
  table.kv td { padding: 5px 8px; vertical-align: top; border-bottom: 0.5pt solid var(--midgrey); }
  table.kv tr:last-child td { border-bottom: none; }
  table.kv td.k { width: 55mm; background: var(--offwhite); font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase; color: var(--body); border-right: 0.5pt solid var(--midgrey); }
  table.kv td.v { font-size: 10pt; color: var(--forest); }
  .addr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; margin-bottom: 18px; }
  .section-head { font-size: 9pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--forest); border-bottom: 0.5pt solid var(--forest); padding-bottom: 4px; margin: 24px 0 8px; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  table.items th { font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: var(--body); background: var(--offwhite); text-align: left; padding: 6px 8px; border-bottom: 0.5pt solid var(--midgrey); }
  table.items td { padding: 9px 8px; border-bottom: 0.5pt solid var(--midgrey); vertical-align: top; font-size: 9pt; }
  table.items tr { page-break-inside: avoid; }
  .c-item { width: 34mm; }
  .c-qty { width: 12mm; text-align: center; }
  .c-num { width: 22mm; text-align: right; white-space: nowrap; }
  th.c-qty { text-align: center; } th.c-num { text-align: right; }
  .thumb { width: 26mm; height: 26mm; object-fit: cover; background: var(--tint); display: block; margin-bottom: 5px; }
  .item-name { color: var(--forest); font-size: 9.5pt; }
  .bespoke { font-size: 7pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--light); }
  .spec-label { font-size: 8pt; letter-spacing: 0.05em; text-transform: uppercase; color: var(--light); }
  .item-note { display: inline-block; background: var(--tint); padding: 2px 6px; margin-top: 3px; color: var(--forest); }
  .muted { color: var(--light); }
  table.totals { border-collapse: collapse; margin: 14px 0 4px auto; min-width: 82mm; }
  table.totals td { padding: 5px 8px; border-bottom: 0.5pt solid var(--midgrey); font-size: 9.5pt; }
  table.totals td:first-child { font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase; color: var(--body); padding-right: 22px; }
  table.totals tr.grand td { color: var(--forest); font-size: 11pt; border-bottom: 1pt solid var(--forest); }
  .doc-footer { margin-top: 26px; padding-top: 8px; border-top: 0.5pt solid var(--midgrey); font-size: 8pt; color: var(--light); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px; }
</style>
</head>
<body>
<div class="toolbar">
  <span>Use “Download PDF”, then choose <strong>Save as PDF</strong> in the print dialogue. Attach the file to your email.</span>
  <span class="fn">${h(filename)}.pdf</span>
  <button onclick="fbaDownload()">Download PDF</button>
</div>
<div class="sheet">
  ${watermark}
  <div class="doc-header">
    <div class="wordmark">Full Bloom Artelier<small>Design Procurement Studio, London</small></div>
    <div class="doc-type">${h(meta.title)}<br><span style="color:var(--light);letter-spacing:0.1em">${h(snap.documentNumber)}</span></div>
  </div>

  <h1 class="title">${h(meta.title)}</h1>
  <div class="subtitle">${head.project_name ? `${h(head.project_name)}${head.project_location ? ` · ${h(head.project_location)}` : ''}` : 'Design Procurement Studio, London'}</div>
  ${disclaimer}

  <table class="kv">
    ${metaRows.map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join('')}
  </table>

  <div class="addr-grid">
    <div>
      <div class="section-head" style="margin-top:0">Client</div>
      <table class="kv">
        ${head.client_company ? `<tr><td class="k">Company</td><td class="v">${h(head.client_company)}</td></tr>` : ''}
        <tr><td class="k">Name</td><td class="v">${h(head.client_name) || '—'}</td></tr>
        ${head.client_email ? `<tr><td class="k">Email</td><td class="v">${h(head.client_email)}</td></tr>` : ''}
        ${head.billing_address ? `<tr><td class="k">Billing Address</td><td class="v">${multiline(head.billing_address)}</td></tr>` : ''}
      </table>
    </div>
    <div>
      <div class="section-head" style="margin-top:0">Project</div>
      <table class="kv">
        <tr><td class="k">Project</td><td class="v">${h(head.project_name) || '—'}</td></tr>
        <tr><td class="k">Location</td><td class="v">${h(head.project_location) || '—'}</td></tr>
        ${head.delivery_address ? `<tr><td class="k">Delivery Address</td><td class="v">${multiline(head.delivery_address)}</td></tr>` : ''}
      </table>
    </div>
  </div>

  ${isServiceInvoice ? '' : itemsTable(productLines, 'Products')}
  ${itemsTable(serviceLines, isServiceInvoice ? 'Services' : 'Professional Services', { unitCol: true })}
  ${itemsTable(otherLines, 'Delivery & Other Charges', { unitCol: true })}
  ${lines.length === 0 ? '<p class="muted">No line items.</p>' : ''}

  ${totalsBlock}

  ${detailRows.length ? `
  <div class="section-head">Payment &amp; Delivery</div>
  <table class="kv">
    ${detailRows.map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join('')}
  </table>` : ''}

  <div class="doc-footer">
    <span>${h(settings.company_legal_name ?? 'Full Bloom Artelier')} · ${h(meta.title)} ${h(snap.documentNumber)} · fullbloom.uk.com · ${h(settings.invoice_email ?? '')}</span>
    <span>${settings.company_registration_number ? `Company No: ${h(settings.company_registration_number)} · ` : ''}${settings.vat_number ? `VAT No: ${h(settings.vat_number)}` : ''}</span>
  </div>
</div>
${logScript}
</body>
</html>`
}
