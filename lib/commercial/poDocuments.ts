// ============================================================
// Purchase-order document renderer (Sprint 2).
//
// Renders the supplier-facing PURCHASE ORDER as print-ready A4
// HTML from a frozen issue snapshot, plus the public supplier
// acknowledgement page. STRICTLY supplier-safe: no client
// selling prices, FBA markup/margin, client fees or deposits,
// other manufacturers, or internal notes ever appear here —
// the renderer only reads supplier-side snapshot fields.
// ============================================================

import { h } from '../proformaDocument'

interface PoSnapshotLine {
  product_name: string
  description: string | null
  specification: string | null
  finish: string | null
  fabric: string | null
  dimensions: string | null
  image: string | null
  supplier_sku: string | null
  fba_sku: string | null
  quantity: number
  unit_of_measure: string
  supplier_cost_unit: number
  discount_amount: number
  tax_category: string
  tax_rate: number | null
  line_net_total: number
  line_tax_total: number
  line_gross_total: number
  required_by_date: string | null
  supplier_notes: string | null
}

export interface PoSnapshot {
  documentNumber: string
  revision: number
  issuedAt: string
  issuedByEmail: string
  po: {
    purchase_order_number: string
    order_date: string | null
    required_by_date: string | null
    acknowledgement_due_date: string | null
    supplier_currency: string
    supplier_contact: Record<string, unknown> | null
    delivery_address: string | null
    payment_terms: string | null
    incoterms: string | null
    supplier_notes: string | null
    commercial_order_reference: string | null
    project_reference: string | null
  }
  lines: PoSnapshotLine[]
  charges: { shipping: number; packaging: number; other: number; other_description: string | null; discount: number }
  totals: { netSubtotal: number; taxTotal: number; grandTotal: number; taxByCategory: Record<string, number> }
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
  standard: 'Standard', reduced: 'Reduced', zero: 'Zero-rated', exempt: 'Exempt',
  outside_scope: 'Outside scope', reverse_charge: 'Reverse charge', unknown: 'TBC',
}

const BASE_CSS = `
  :root { --forest:#1B4332; --offwhite:#FAFAF8; --white:#FFF; --midgrey:#C8C8C0; --body:#555550; --light:#888880; --tint:#E8F0EB; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { background: #EFEFEA; }
  body { font-family: Georgia, 'Times New Roman', serif; color: var(--body); font-size: 9.5pt; line-height: 1.45; }
  @page { size: A4; margin: 21mm 20mm 25mm; }
  .sheet { max-width: 180mm; margin: 0 auto; background: var(--white); padding: 14mm 12mm; position: relative; }
  @media print { html { background: var(--white); } .sheet { max-width: none; padding: 0; } .toolbar, .ack-panel { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  .toolbar { position: sticky; top: 0; z-index: 10; background: var(--forest); color: #fff; padding: 10px 16px; display: flex; align-items: center; gap: 14px; font-size: 12px; }
  .toolbar button { margin-left: auto; background: #fff; color: var(--forest); border: none; font-family: Georgia, serif; font-size: 13px; padding: 8px 18px; cursor: pointer; letter-spacing: 0.08em; }
  .watermark { position: absolute; top: 40%; left: 0; right: 0; text-align: center; transform: rotate(-24deg); font-size: 34pt; letter-spacing: 0.3em; color: rgba(160,48,48,0.15); pointer-events: none; z-index: 5; }
  .doc-header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5px solid var(--forest); padding-bottom: 10px; }
  .wordmark { font-size: 15pt; letter-spacing: 0.32em; text-transform: uppercase; color: var(--forest); }
  .wordmark small { display: block; font-size: 7.5pt; letter-spacing: 0.22em; color: var(--light); font-style: italic; margin-top: 3px; text-transform: none; }
  .doc-type { font-size: 9pt; letter-spacing: 0.3em; text-transform: uppercase; color: var(--forest); text-align: right; }
  h1.title { font-size: 24pt; font-weight: normal; color: var(--forest); margin: 24px 0 14px; }
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
  .c-item { width: 34mm; } .c-qty { width: 14mm; text-align: center; } .c-num { width: 22mm; text-align: right; white-space: nowrap; }
  th.c-qty { text-align: center; } th.c-num { text-align: right; }
  .thumb { width: 24mm; height: 24mm; object-fit: cover; background: var(--tint); display: block; margin-bottom: 5px; }
  .item-name { color: var(--forest); font-size: 9.5pt; }
  .spec-label { font-size: 8pt; letter-spacing: 0.05em; text-transform: uppercase; color: var(--light); }
  .item-note { display: inline-block; background: var(--tint); padding: 2px 6px; margin-top: 3px; color: var(--forest); }
  .muted { color: var(--light); }
  table.totals { border-collapse: collapse; margin: 14px 0 4px auto; min-width: 82mm; }
  table.totals td { padding: 5px 8px; border-bottom: 0.5pt solid var(--midgrey); font-size: 9.5pt; }
  table.totals td:first-child { font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase; color: var(--body); padding-right: 22px; }
  table.totals tr.grand td { color: var(--forest); font-size: 11pt; border-bottom: 1pt solid var(--forest); }
  .doc-footer { margin-top: 26px; padding-top: 8px; border-top: 0.5pt solid var(--midgrey); font-size: 8pt; color: var(--light); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px; }
`

function poBody(snap: PoSnapshot, opts: { draft?: boolean; companyIdentity: { legalName: string; regNumber: string | null; vatNumber: string | null; address: string | null; email: string } }): string {
  const cur = snap.po.supplier_currency ?? 'GBP'
  const contact = (snap.po.supplier_contact ?? {}) as Record<string, unknown>
  const id = opts.companyIdentity

  const specHtml = (l: PoSnapshotLine): string => {
    const parts: string[] = []
    if (l.description) parts.push(multiline(l.description))
    if (l.dimensions) parts.push(`<span class="spec-label">Size:</span> ${h(l.dimensions)}`)
    if (l.finish) parts.push(`<span class="spec-label">Finish:</span> ${h(l.finish)}`)
    if (l.fabric) parts.push(`<span class="spec-label">Fabric / Upholstery:</span> ${h(l.fabric)}`)
    if (l.specification) parts.push(multiline(l.specification))
    if (l.supplier_notes) parts.push(`<span class="item-note"><span class="spec-label">Instruction:</span> ${multiline(l.supplier_notes)}</span>`)
    return parts.join('<br>')
  }

  const rows = snap.lines.map(l => `
      <tr>
        <td class="c-item">
          ${l.image ? `<img class="thumb" src="${h(l.image)}" alt="">` : ''}
          <div class="item-name">${h(l.product_name)}</div>
          ${l.supplier_sku ? `<div class="muted" style="font-size:8pt">SKU: ${h(l.supplier_sku)}</div>` : ''}
          ${l.fba_sku ? `<div class="muted" style="font-size:8pt">FBA ref: ${h(l.fba_sku)}</div>` : ''}
        </td>
        <td class="c-spec">${specHtml(l) || '<span class="muted">—</span>'}</td>
        <td class="c-qty">${h(l.quantity)}${l.unit_of_measure && l.unit_of_measure !== 'each' ? `<br><span class="muted" style="font-size:7.5pt">${h(l.unit_of_measure)}</span>` : ''}</td>
        <td class="c-num">${money(l.supplier_cost_unit, cur)}</td>
        <td class="c-num">${l.tax_rate != null && l.tax_rate > 0 ? `${h(l.tax_rate)}%` : h(TAX_LABEL[l.tax_category] ?? l.tax_category)}</td>
        <td class="c-num">${l.discount_amount > 0 ? `−${money(l.discount_amount, cur)}<br>` : ''}${money(l.line_net_total, cur)}</td>
      </tr>`).join('')

  const totalsRows: Array<[string, string, boolean]> = []
  totalsRows.push(['Lines subtotal (net)', money(snap.totals.netSubtotal - snap.charges.shipping - snap.charges.packaging - snap.charges.other + snap.charges.discount, cur), false])
  if (snap.charges.shipping > 0) totalsRows.push(['Shipping / freight', money(snap.charges.shipping, cur), false])
  if (snap.charges.packaging > 0) totalsRows.push(['Packaging / crating', money(snap.charges.packaging, cur), false])
  if (snap.charges.other > 0) totalsRows.push([snap.charges.other_description || 'Other charges', money(snap.charges.other, cur), false])
  if (snap.charges.discount > 0) totalsRows.push(['Supplier discount', `−${money(snap.charges.discount, cur)}`, false])
  totalsRows.push(['Net subtotal', money(snap.totals.netSubtotal, cur), false])
  totalsRows.push(['Tax', money(snap.totals.taxTotal, cur), false])
  totalsRows.push(['PO total', money(snap.totals.grandTotal, cur), true])

  return `
  ${opts.draft ? '<div class="watermark">DRAFT — NOT ISSUED</div>' : ''}
  <div class="doc-header">
    <div class="wordmark">Full Bloom Artelier<small>Design Procurement Studio, London</small></div>
    <div class="doc-type">Purchase Order<br><span style="color:var(--light);letter-spacing:0.1em">${h(snap.documentNumber)}</span></div>
  </div>

  <h1 class="title">Purchase Order</h1>

  <table class="kv">
    <tr><td class="k">PO Number</td><td class="v">${h(snap.documentNumber)}</td></tr>
    ${snap.revision > 1 ? `<tr><td class="k">Revision</td><td class="v">R${String(snap.revision).padStart(2, '0')} — supersedes all earlier revisions</td></tr>` : ''}
    <tr><td class="k">Issue Date</td><td class="v">${fmtDate(snap.issuedAt)}</td></tr>
    <tr><td class="k">Order Reference</td><td class="v">${h(snap.po.commercial_order_reference) || '—'}</td></tr>
    ${snap.po.project_reference ? `<tr><td class="k">Project</td><td class="v">${h(snap.po.project_reference)}</td></tr>` : ''}
    <tr><td class="k">Required Delivery Date</td><td class="v">${fmtDate(snap.po.required_by_date)}</td></tr>
    <tr><td class="k">Acknowledgement Due</td><td class="v">${fmtDate(snap.po.acknowledgement_due_date)}</td></tr>
    <tr><td class="k">Currency</td><td class="v">${h(cur)}</td></tr>
  </table>

  <div class="addr-grid">
    <div>
      <div class="section-head" style="margin-top:0">Supplier</div>
      <table class="kv">
        <tr><td class="k">Name</td><td class="v">${h(contact.legal_name ?? contact.trading_name) || '—'}</td></tr>
        ${contact.trading_name && contact.trading_name !== contact.legal_name ? `<tr><td class="k">Trading As</td><td class="v">${h(contact.trading_name)}</td></tr>` : ''}
        ${contact.primary_contact_name ? `<tr><td class="k">Contact</td><td class="v">${h(contact.primary_contact_name)}</td></tr>` : ''}
        ${contact.address ? `<tr><td class="k">Address</td><td class="v">${multiline(contact.address)}${contact.country ? `<br>${h(contact.country)}` : ''}</td></tr>` : ''}
        ${contact.vat_or_tax_number ? `<tr><td class="k">VAT / Tax No.</td><td class="v">${h(contact.vat_or_tax_number)}</td></tr>` : ''}
      </table>
    </div>
    <div>
      <div class="section-head" style="margin-top:0">Deliver To</div>
      <table class="kv">
        <tr><td class="k">Delivery Address</td><td class="v">${multiline(snap.po.delivery_address) || 'To be confirmed'}</td></tr>
      </table>
    </div>
  </div>

  <div class="section-head">Order Lines</div>
  <table class="items">
    <thead>
      <tr><th class="c-item">Item</th><th class="c-spec">Specification</th><th class="c-qty">Qty</th><th class="c-num">Unit Cost</th><th class="c-num">Tax</th><th class="c-num">Total (net)</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  ${`<table class="totals">${totalsRows.map(([k, v, g]) => `<tr${g ? ' class="grand"' : ''}><td>${h(k)}</td><td class="c-num">${v}</td></tr>`).join('')}</table>`}

  <div class="section-head">Terms &amp; Instructions</div>
  <table class="kv">
    ${snap.po.payment_terms ? `<tr><td class="k">Payment Terms</td><td class="v">${multiline(snap.po.payment_terms)}</td></tr>` : ''}
    ${snap.po.incoterms ? `<tr><td class="k">Incoterms</td><td class="v">${h(snap.po.incoterms)}</td></tr>` : ''}
    ${snap.po.supplier_notes ? `<tr><td class="k">Supplier Instructions</td><td class="v">${multiline(snap.po.supplier_notes)}</td></tr>` : ''}
    <tr><td class="k">Acknowledgement</td><td class="v">Please acknowledge this purchase order by ${fmtDate(snap.po.acknowledgement_due_date)} using the secure link provided with this order. Acknowledgement confirms price, specification and delivery commitment.</td></tr>
    <tr><td class="k">Authorised By</td><td class="v">${h(snap.issuedByEmail)} · Full Bloom Artelier</td></tr>
  </table>

  <div class="doc-footer">
    <span>${h(id.legalName)} · Purchase Order ${h(snap.documentNumber)} · ${h(id.email)}</span>
    <span>${id.regNumber ? `Company No: ${h(id.regNumber)} · ` : ''}${id.vatNumber ? `VAT No: ${h(id.vatNumber)}` : ''}</span>
  </div>`
}

/** Internal/admin render: print-ready PO with download toolbar. */
export function renderPurchaseOrderDocument(snap: PoSnapshot, opts: {
  draft?: boolean
  companyIdentity: { legalName: string; regNumber: string | null; vatNumber: string | null; address: string | null; email: string }
  logEndpoint?: string
}): string {
  const filename = `FBA_PO_${snap.documentNumber.replace(/[^A-Za-z0-9-]/g, '')}`
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>${h(filename)}</title><style>${BASE_CSS}</style></head>
<body>
<div class="toolbar">
  <span>Use “Download PDF”, then choose <strong>Save as PDF</strong> in the print dialogue.</span>
  <span style="opacity:.75">${h(filename)}.pdf</span>
  <button onclick="fbaDownload()">Download PDF</button>
</div>
<div class="sheet">${poBody(snap, opts)}</div>
<script>
  async function fbaDownload() {
    ${opts.logEndpoint ? `try { await fetch(${JSON.stringify(opts.logEndpoint)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docType: 'purchase_order' }) }) } catch (e) {}` : ''}
    window.print()
  }
</script>
</body></html>`
}

/** Public supplier acknowledgement page: supplier-safe PO + accept/amend form. */
export function renderSupplierAckPage(snap: PoSnapshot, opts: {
  tokenPath: string     // e.g. /api/supplier/purchase-orders/<token>
  companyIdentity: { legalName: string; regNumber: string | null; vatNumber: string | null; address: string | null; email: string }
  alreadyAcknowledged: { name: string; at: string } | null
  amendmentRequested: boolean
}): string {
  const ackFormHtml = opts.alreadyAcknowledged ? `
  <div class="ack-done">
    <strong>Acknowledged</strong> by ${h(opts.alreadyAcknowledged.name)} on ${fmtDate(opts.alreadyAcknowledged.at)}.
    Thank you — Full Bloom Artelier has been notified.
  </div>` : opts.amendmentRequested ? `
  <div class="ack-done amber">
    <strong>Amendment requested.</strong> Full Bloom Artelier has been notified and will issue a revised purchase order if required.
  </div>` : `
  <form id="ackForm" onsubmit="return submitAck(event)">
    <div class="section-head" style="margin-top:0">Acknowledge this purchase order</div>
    <p style="font-size:13px;color:var(--body);margin-bottom:14px">
      Acknowledgement confirms price, specification, and delivery commitment for PO ${h(snap.documentNumber)}.
    </p>
    <div class="ack-grid">
      <label>Your name *<input name="name" required maxlength="200"></label>
      <label>Your email *<input name="email" type="email" required maxlength="200"></label>
      <label>Expected completion / dispatch date<input name="expectedDate" type="date"></label>
    </div>
    <label style="display:block;margin-top:10px">Note (optional)<textarea name="note" maxlength="2000" rows="3"></textarea></label>
    <div class="ack-actions">
      <button type="submit" class="btn-accept" onclick="document.getElementById('ackForm').dataset.action='accept'">Accept purchase order</button>
      <button type="submit" class="btn-amend" onclick="document.getElementById('ackForm').dataset.action='amend'">Request amendment</button>
    </div>
    <div id="ackMsg" style="margin-top:10px;font-size:13px"></div>
  </form>`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Purchase Order ${h(snap.documentNumber)} — Full Bloom Artelier</title>
<style>${BASE_CSS}
  .ack-panel { max-width: 180mm; margin: 18px auto; background: var(--white); border: 1.5px solid var(--forest); padding: 22px 26px; }
  .ack-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  .ack-panel label { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--body); display: block; }
  .ack-panel input, .ack-panel textarea { width: 100%; border: 1px solid var(--midgrey); padding: 8px; font-family: Georgia, serif; font-size: 14px; margin-top: 4px; }
  .ack-actions { display: flex; gap: 10px; margin-top: 14px; }
  .btn-accept { background: var(--forest); color: #fff; border: none; padding: 12px 22px; font-family: Georgia, serif; font-size: 14px; letter-spacing: 0.06em; cursor: pointer; }
  .btn-amend { background: #fff; color: var(--forest); border: 1.5px solid var(--forest); padding: 12px 22px; font-family: Georgia, serif; font-size: 14px; letter-spacing: 0.06em; cursor: pointer; }
  .ack-done { background: var(--tint); color: var(--forest); padding: 16px 20px; font-size: 14px; }
  .ack-done.amber { background: #faf3dd; color: #8a6d1a; }
  @media (max-width: 640px) { .ack-grid { grid-template-columns: 1fr; } }
</style></head>
<body>
<div class="toolbar">
  <span>Purchase order from Full Bloom Artelier. Print or save via your browser if needed.</span>
</div>
<div class="ack-panel">${ackFormHtml}</div>
<div class="sheet">${poBody(snap, { companyIdentity: opts.companyIdentity })}</div>
<script>
  async function submitAck(e) {
    e.preventDefault()
    var form = document.getElementById('ackForm')
    var action = form.dataset.action || 'accept'
    var msg = document.getElementById('ackMsg')
    var fd = new FormData(form)
    msg.textContent = 'Submitting…'
    try {
      var res = await fetch(${JSON.stringify(`${''}`)} + window.location.pathname.replace('/supplier/', '/api/supplier/') + '/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action,
          name: fd.get('name'),
          email: fd.get('email'),
          expectedDate: fd.get('expectedDate') || null,
          note: fd.get('note') || null,
        }),
      })
      var data = await res.json()
      if (data.success) { window.location.reload() } else { msg.textContent = data.error || 'Submission failed. Please try again.' }
    } catch (err) { msg.textContent = 'Submission failed. Please try again.' }
    return false
  }
</script>
</body></html>`
}
