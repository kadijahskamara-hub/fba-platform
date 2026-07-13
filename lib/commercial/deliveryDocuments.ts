// ============================================================
// Delivery-note renderer (Sprint 4) — NO-PRICE BY DESIGN.
//
// Renders the DELIVERY NOTE as print-ready A4 HTML from a frozen
// issue snapshot in three tailored copies:
//   • client       — full shipment confirmation (what was sent)
//   • site         — receiver checklist + sign-off + QR/URL to the
//                    secure confirmation page
//   • manufacturer — that maker's items only, packing-list style,
//                    referencing the related purchase order
//
// Visual language follows the Sprint-3.5 rebrand (FBA logo,
// editorial layout, monogram/photo tiles). The renderer REFUSES
// to render if the snapshot contains any price/cost field
// (findForbiddenDeliveryFields deep-scan).
// ============================================================

import fs from 'fs'
import path from 'path'
import { h } from '../proformaDocument'
import {
  findForbiddenDeliveryFields,
  type DeliveryNoteAudience, type DeliveryNoteLine, type DeliveryNoteSnapshot,
} from './deliveryLogic'

export interface RenderDeliveryNoteOptions {
  audience: DeliveryNoteAudience
  draft?: boolean
  /** Maker filter for the manufacturer copy (defaults to the direct-origin maker). */
  manufacturerId?: string | null
  /** Site copy: QR data-URI + full confirmation URL (both printed, spec §9.3). */
  confirmation?: { qrDataUri: string | null; url: string } | null
  logEndpoint?: string
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
function monogram(name: string): string {
  const letters = (name || '').replace(/[^A-Za-z]/g, '')
  return (letters.slice(0, 2) || '—').toUpperCase()
}

// ── Inlined brand logo (cached; same asset as documents.ts) ──
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

const AUDIENCE_META: Record<DeliveryNoteAudience, { subtitle: string; intro: string }> = {
  client: {
    subtitle: 'Client Copy',
    intro: 'This delivery note confirms the items dispatched on this shipment. It carries no prices; commercial terms are on your invoice.',
  },
  site: {
    subtitle: 'Site Copy',
    intro: 'Please check each item against this list on arrival, then confirm receipt using the QR code or link below.',
  },
  manufacturer: {
    subtitle: 'Maker Copy',
    intro: 'Packing list for the items supplied by you on this shipment, referencing your purchase order.',
  },
}

export function deliveryNoteFilename(snap: DeliveryNoteSnapshot, audience: DeliveryNoteAudience): string {
  const num = snap.deliveryNumber.replace(/[^A-Za-z0-9-]/g, '')
  const suffix = audience === 'client' ? 'Client' : audience === 'site' ? 'Site' : 'Maker'
  return `FBA_DeliveryNote_${num}_${suffix}`
}

export function renderDeliveryNote(snap: DeliveryNoteSnapshot, opts: RenderDeliveryNoteOptions): string {
  // NO-PRICE GUARD — refuse to render any snapshot carrying money fields.
  const leaks = findForbiddenDeliveryFields(snap)
  if (leaks.length > 0) {
    throw new Error(`Refusing to render delivery note: forbidden fields present: ${leaks.join(', ')}`)
  }

  const audience = opts.audience
  const meta = AUDIENCE_META[audience]
  const logo = logoDataUri()
  const filename = deliveryNoteFilename(snap, audience)

  // Manufacturer copy: that maker's items only.
  const makerId = opts.manufacturerId ?? null
  let lines: DeliveryNoteLine[] = snap.lines
  let makerName: string | null = null
  if (audience === 'manufacturer') {
    if (makerId) {
      lines = snap.lines.filter(l => l.manufacturer_id === makerId)
      makerName = lines[0]?.manufacturer_name ?? null
    } else if (snap.delivery.origin_type === 'direct_maker') {
      makerName = snap.delivery.origin_manufacturer_name
      lines = snap.lines.filter(l => !makerName || l.manufacturer_name === makerName)
    }
  }
  const poRefs = [...new Set(lines.map(l => l.purchase_order_number).filter(Boolean))] as string[]

  const tile = (l: DeliveryNoteLine): string =>
    l.image_url
      ? `<div class="tile"><img src="${h(l.image_url)}" alt=""></div>`
      : `<div class="tile mono">${h(monogram(l.name))}</div>`

  const specHtml = (l: DeliveryNoteLine): string => {
    const parts: string[] = []
    if (l.description) parts.push(multiline(l.description))
    if (l.selected_size) parts.push(`<span class="spec-label">Size:</span> ${h(l.selected_size)}`)
    if (l.selected_finish) parts.push(`<span class="spec-label">Finish:</span> ${h(l.selected_finish)}`)
    if (l.selected_fabric) parts.push(`<span class="spec-label">Fabric / Upholstery:</span> ${h(l.selected_fabric)}`)
    if (l.spec_details) parts.push(multiline(l.spec_details))
    if (l.notes) parts.push(`<span class="item-note"><span class="spec-label">Note:</span> ${multiline(l.notes)}</span>`)
    return parts.join('<br>')
  }

  const qtyCell = (l: DeliveryNoteLine): string => {
    const partial = l.ordered_quantity > 0 && l.quantity < l.ordered_quantity
    return `${h(l.quantity)}${partial ? `<br><span class="muted" style="font-size:7.5pt">of ${h(l.ordered_quantity)} ordered</span>` : ''}${l.unit_of_measure && l.unit_of_measure !== 'each' ? `<br><span class="muted" style="font-size:7.5pt">${h(l.unit_of_measure)}</span>` : ''}`
  }

  const isSite = audience === 'site'
  const rows = lines.map(l => `
      <tr>
        ${isSite ? '<td class="c-check"><span class="checkbox"></span></td>' : ''}
        <td class="c-item">
          ${tile(l)}
          <div class="item-name">${h(l.name)}</div>
          ${audience === 'manufacturer' && l.purchase_order_number ? `<div class="muted" style="font-size:8pt">PO: ${h(l.purchase_order_number)}</div>` : ''}
          ${audience === 'client' && l.manufacturer_name ? `<div class="muted" style="font-size:8pt">Maker: ${h(l.manufacturer_name)}</div>` : ''}
        </td>
        <td class="c-spec">${specHtml(l) || '<span class="muted">—</span>'}</td>
        <td class="c-qty">${qtyCell(l)}</td>
        ${isSite ? '<td class="c-cond"><span class="cond-line"></span><span class="cond-line"></span></td>' : ''}
      </tr>`).join('')

  const itemsTable = `
    <div class="section-head">Items on this delivery</div>
    <table class="items">
      <thead>
        <tr>
          ${isSite ? '<th class="c-check">✓</th>' : ''}
          <th class="c-item">Item</th><th class="c-spec">Specification</th><th class="c-qty">Qty</th>
          ${isSite ? '<th class="c-cond">Condition on arrival</th>' : ''}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${lines.length === 0 ? '<p class="muted">No items for this copy.</p>' : ''}`

  // Address block.
  const loc = snap.location
  const addressLines = [loc.address_line1, loc.address_line2, loc.city, loc.region, loc.postcode, loc.country]
    .filter(Boolean).map(x => h(x)).join('<br>')
  const primaryContact = snap.contacts.find(c => c.is_primary) ?? snap.contacts[0] ?? null
  const contactsHtml = snap.contacts.length === 0 ? '<span class="muted">—</span>' : snap.contacts.map(c => `
      <div style="margin-bottom:4px">
        <strong style="color:var(--forest)">${h(c.name)}</strong>${c.role ? ` · ${h(c.role)}` : ''}${c.is_primary ? ' <span class="bespoke">Primary</span>' : ''}<br>
        <span class="muted">${[c.phone, c.email].filter(Boolean).map(x => h(x)).join(' · ') || '—'}</span>
      </div>`).join('')

  // Meta columns.
  const metaCols: [string, string][] = [
    ['Delivery Number', h(snap.deliveryNumber)],
    ['Dispatch Date', fmtDate(snap.delivery.dispatched_at ?? snap.issuedAt)],
  ]
  if (snap.delivery.expected_date) metaCols.push(['Expected Delivery', fmtDate(snap.delivery.expected_date)])
  if (snap.orderNumber) metaCols.push(['Order Reference', h(snap.orderNumber)])
  if (snap.proformaReference) metaCols.push(['Proforma Reference', h(snap.proformaReference)])
  if (audience === 'manufacturer' && poRefs.length > 0) metaCols.push([poRefs.length > 1 ? 'Purchase Orders' : 'Purchase Order', poRefs.map(x => h(x)).join(' · ')])

  const originLabel = snap.delivery.origin_type === 'direct_maker'
    ? `Direct from maker${snap.delivery.origin_manufacturer_name ? ` — ${h(snap.delivery.origin_manufacturer_name)}` : ''}`
    : 'Consolidated via Full Bloom Artelier'

  // Detail rows.
  const detailRows: [string, string][] = [
    ['Origin', originLabel],
  ]
  if (snap.delivery.carrier) detailRows.push(['Carrier', h(snap.delivery.carrier)])
  if (snap.delivery.instructions) detailRows.push(['Delivery Instructions', multiline(snap.delivery.instructions)])
  if (loc.access_notes) detailRows.push(['Site Access', multiline(loc.access_notes)])

  // Packages.
  const packagesBlock = snap.packages.length === 0 ? '' : `
    <div class="section-head">Packages &amp; consignment references</div>
    <table class="items">
      <thead><tr><th>Reference</th><th>Description</th><th>Weight</th><th>Dimensions</th></tr></thead>
      <tbody>${snap.packages.map(p => `
        <tr>
          <td>${h(p.reference) || '<span class="muted">—</span>'}</td>
          <td>${h(p.description) || '<span class="muted">—</span>'}</td>
          <td>${h(p.weight) || '<span class="muted">—</span>'}</td>
          <td>${h(p.dimensions) || '<span class="muted">—</span>'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`

  // Installation summary — client copy only (spec §3).
  const installBlock = audience === 'client' && snap.installation ? `
    <div class="section-head">Installation</div>
    <table class="items">
      <tbody>
        <tr>
          <td style="width:40mm"><strong style="color:var(--forest)">${h(snap.installation.installation_number)}</strong></td>
          <td>${h(snap.installation.status.replace(/_/g, ' '))}</td>
          <td>${snap.installation.scheduled_date ? `Scheduled ${fmtDate(snap.installation.scheduled_date)}` : 'Not yet scheduled'}</td>
          <td>${h(snap.installation.installer_name) || '<span class="muted">Installer TBC</span>'}</td>
        </tr>
      </tbody>
    </table>` : ''

  // Site copy: sign-off + exceptions + QR/URL confirmation block.
  const confirmationBlock = isSite ? `
    <div class="section-head">Condition check &amp; sign-off</div>
    <div class="signoff-grid">
      <div class="signoff-box">
        <span class="lbl">Received by (name)</span>
        <div class="write-line"></div>
        <span class="lbl" style="margin-top:10px">Date &amp; time</span>
        <div class="write-line"></div>
      </div>
      <div class="signoff-box">
        <span class="lbl">Signature</span>
        <div class="sig-area"></div>
      </div>
      <div class="signoff-box">
        <span class="lbl">Shortages / damages (item &amp; quantity)</span>
        <div class="write-line"></div>
        <div class="write-line"></div>
        <div class="write-line"></div>
      </div>
    </div>
    ${opts.confirmation ? `
    <div class="confirm-panel">
      ${opts.confirmation.qrDataUri ? `<img class="qr" src="${h(opts.confirmation.qrDataUri)}" alt="Confirmation QR code">` : ''}
      <div>
        <div class="lbl" style="margin-bottom:4px">Confirm this delivery online</div>
        <p style="margin:0 0 6px;font-size:9pt">Scan the QR code or visit the address below to record receipt, signature, photos and any shortages or damages. Either the site contact or the client may confirm.</p>
        <div class="confirm-url">${h(opts.confirmation.url)}</div>
      </div>
    </div>` : `
    <div class="confirm-panel"><div>
      <div class="lbl" style="margin-bottom:4px">Confirm this delivery online</div>
      <p style="margin:0;font-size:9pt">A secure confirmation link is issued with this delivery — contact Full Bloom Artelier if you have not received it.</p>
    </div></div>`}` : ''

  const watermark = opts.draft ? '<div class="watermark">DRAFT — NOT ISSUED</div>' : ''
  const logoHtml = logo
    ? `<img class="logo" src="${logo}" alt="Full Bloom Artelier">`
    : '<div class="logo-text">Full Bloom Artelier</div>'

  const s = snap.settings
  const logScript = opts.logEndpoint ? `
<script>
  var FBA_LOG = { endpoint: ${JSON.stringify(opts.logEndpoint)}, payload: ${JSON.stringify({ docType: 'delivery_note', audience })} };
  async function fbaDownload() {
    try { await fetch(FBA_LOG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(FBA_LOG.payload) }) } catch (e) {}
    window.print()
  }
</script>` : '<script>function fbaDownload(){window.print()}</script>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex,nofollow">
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
  }
  .toolbar { position: sticky; top: 0; z-index: 10; background: var(--forest); color: #fff; padding: 10px 16px; display: flex; align-items: center; gap: 14px; font-size: 12px; font-family: Georgia, serif; }
  .toolbar .fn { opacity: 0.75; letter-spacing: 0.06em; }
  .toolbar button { margin-left: auto; background: #fff; color: var(--forest); border: none; font-family: Georgia, serif; font-size: 13px; padding: 8px 18px; cursor: pointer; letter-spacing: 0.08em; }
  .watermark { position: absolute; top: 42%; left: 0; right: 0; text-align: center; transform: rotate(-24deg); font-size: 40pt; letter-spacing: 0.3em; color: rgba(160,48,48,0.12); pointer-events: none; z-index: 5; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .title { font-size: 27pt; font-weight: normal; letter-spacing: 0.14em; text-transform: uppercase; color: var(--forest); line-height: 1; }
  .subtitle { font-size: 8pt; letter-spacing: 0.24em; text-transform: uppercase; color: var(--light); margin-top: 8px; }
  .copy-tag { display: inline-block; background: var(--tint); color: var(--forest); font-size: 8pt; letter-spacing: 0.2em; text-transform: uppercase; padding: 4px 12px; margin-top: 10px; }
  .logo { width: 42mm; height: auto; }
  .logo-text { font-size: 15pt; letter-spacing: 0.2em; text-transform: uppercase; color: var(--forest); text-align: right; }
  .hr { border-top: 0.75pt solid var(--forest); margin: 12px 0 18px; }
  .meta { display: flex; gap: 34px; flex-wrap: wrap; margin-bottom: 20px; }
  .meta .m .k, .lbl { font-size: 7.5pt; letter-spacing: 0.14em; text-transform: uppercase; color: var(--light); display: block; margin-bottom: 3px; }
  .meta .m .v { font-size: 10.5pt; color: var(--forest); }
  .addr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 34px; margin-bottom: 14px; }
  .addr .name { font-size: 10.5pt; color: var(--forest); font-weight: bold; margin-bottom: 2px; }
  .addr .val { font-size: 9.5pt; color: var(--body); }
  .intro { font-size: 8.5pt; color: var(--light); margin-bottom: 16px; }
  .section-head { font-size: 8.5pt; letter-spacing: 0.18em; text-transform: uppercase; color: var(--forest-soft); border-bottom: 0.5pt solid var(--midgrey); padding-bottom: 5px; margin: 24px 0 4px; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.items th { font-size: 7.5pt; letter-spacing: 0.14em; text-transform: uppercase; color: var(--light); text-align: left; padding: 8px 8px; border-bottom: 0.5pt solid var(--midgrey); font-weight: normal; }
  table.items td { padding: 12px 8px; border-bottom: 0.5pt solid #ECEAE3; vertical-align: top; font-size: 9pt; }
  table.items tr { page-break-inside: avoid; }
  .c-item { width: 42mm; }
  .c-qty { width: 18mm; text-align: center; }
  th.c-qty { text-align: center; }
  .c-check { width: 8mm; text-align: center; }
  .checkbox { display: inline-block; width: 4.5mm; height: 4.5mm; border: 0.75pt solid var(--forest); }
  .c-cond { width: 34mm; }
  .cond-line { display: block; border-bottom: 0.5pt solid var(--midgrey); height: 6mm; }
  .tile { width: 15mm; height: 15mm; border: 0.5pt solid var(--midgrey); margin-bottom: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #fff; }
  .tile.mono { color: var(--forest); font-size: 12pt; letter-spacing: 0.08em; }
  .tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .item-name { color: var(--forest); font-size: 9.5pt; }
  .bespoke { font-size: 7pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--light); }
  .spec-label { font-size: 8pt; letter-spacing: 0.05em; text-transform: uppercase; color: var(--light); }
  .item-note { display: inline-block; background: var(--tint); padding: 2px 6px; margin-top: 3px; color: var(--forest); }
  .muted { color: var(--light); }
  .pay { margin-top: 20px; }
  .pay .blk { margin-bottom: 12px; }
  .pay .val { font-size: 9.5pt; color: var(--body); }
  .signoff-grid { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 12px; margin-top: 8px; }
  .signoff-box { border: 0.5pt solid var(--midgrey); padding: 10px 12px; min-height: 30mm; }
  .write-line { border-bottom: 0.5pt solid var(--midgrey); height: 8mm; }
  .sig-area { border: 0.5pt dashed var(--midgrey); height: 22mm; margin-top: 4px; }
  .confirm-panel { display: flex; gap: 16px; align-items: center; border: 1pt solid var(--forest); background: var(--offwhite); padding: 12px 16px; margin-top: 16px; page-break-inside: avoid; }
  .confirm-panel .qr { width: 26mm; height: 26mm; }
  .confirm-url { font-size: 8.5pt; color: var(--forest); word-break: break-all; border: 0.5pt solid var(--midgrey); background: #fff; padding: 5px 8px; }
  .doc-footer { margin-top: 30px; padding-top: 8px; border-top: 0.5pt solid var(--midgrey); font-size: 7.5pt; letter-spacing: 0.04em; color: var(--light); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
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
      <div class="title">Delivery Note</div>
      <div class="subtitle">Full Bloom Artelier · Design Procurement Studio, London</div>
      <span class="copy-tag">${h(meta.subtitle)}${audience === 'manufacturer' && makerName ? ` — ${h(makerName)}` : ''}</span>
    </div>
    ${logoHtml}
  </div>
  <div class="hr"></div>

  <div class="meta">
    ${metaCols.map(([k, v]) => `<div class="m"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}
  </div>

  <div class="addr-grid">
    <div class="addr">
      <span class="lbl">Deliver To — ${h(loc.label)}</span>
      <div class="name">${h(snap.client.company || snap.client.name) || '—'}</div>
      ${snap.project.name ? `<div class="val">${h(snap.project.name)}${snap.project.location ? ` · ${h(snap.project.location)}` : ''}</div>` : ''}
      <div class="val">${addressLines || '—'}</div>
    </div>
    <div class="addr">
      <span class="lbl">Site Contact${snap.contacts.length > 1 ? 's' : ''}</span>
      ${audience === 'manufacturer'
        ? (primaryContact
          ? `<div style="margin-bottom:4px"><strong style="color:var(--forest)">${h(primaryContact.name)}</strong>${primaryContact.role ? ` · ${h(primaryContact.role)}` : ''}<br><span class="muted">${[primaryContact.phone, primaryContact.email].filter(Boolean).map(x => h(x)).join(' · ') || '—'}</span></div>`
          : '<span class="muted">—</span>')
        : contactsHtml}
    </div>
  </div>

  <p class="intro">${h(meta.intro)}</p>

  ${itemsTable}
  ${packagesBlock}
  ${installBlock}

  ${detailRows.length ? `
  <div class="pay">
    ${detailRows.map(([k, v]) => `<div class="blk"><span class="lbl">${k}</span><div class="val">${v}</div></div>`).join('')}
  </div>` : ''}

  ${confirmationBlock}

  <div class="doc-footer">
    <span>${h(s.company_legal_name)} · Delivery Note ${h(snap.deliveryNumber)} · ${h(s.contact_email)}${s.contact_phone ? ` · ${h(s.contact_phone)}` : ''}</span>
    <span>${s.company_registration_number ? `Company No: ${h(s.company_registration_number)}` : ''}</span>
  </div>
</div>
${logScript}
</body>
</html>`
}

// ============================================================
// Public site-confirmation page (secure link). Mirrors the
// Sprint-3 acceptance page: no-store, noindex, no internals.
// Captures received-by, signature (canvas), photos and per-line
// shortage/damage/wrong-item exceptions.
// ============================================================

export function renderDeliveryConfirmationPage(
  snap: DeliveryNoteSnapshot,
  opts: {
    tokenPath: string   // POST target: /api/delivery/confirm/<token>
    deliveryLines: Array<{ id: string; quantity: number }>   // live delivery_lines ids
    alreadyConfirmed: { at: string } | null
  },
): string {
  const leaks = findForbiddenDeliveryFields(snap)
  if (leaks.length > 0) {
    throw new Error(`Refusing to render confirmation page: forbidden fields present: ${leaks.join(', ')}`)
  }

  const lineById = new Map(snap.lines.map(l => [l.id, l]))
  const rows = opts.deliveryLines.map(dl => {
    const l = lineById.get(dl.id)
    const name = l?.name ?? 'Item'
    return `
      <tr data-line="${h(dl.id)}">
        <td><strong>${h(name)}</strong>${l?.selected_finish ? `<div class="muted sm">${h(l.selected_finish)}</div>` : ''}</td>
        <td class="num">${h(dl.quantity)}</td>
        <td>
          <select name="exc-type">
            <option value="">Received in full</option>
            <option value="shortage">Shortage</option>
            <option value="damage">Damage</option>
            <option value="wrong_item">Wrong item</option>
          </select>
        </td>
        <td><input name="exc-qty" type="number" min="1" step="1" placeholder="qty" style="width:70px" disabled></td>
        <td><input name="exc-notes" maxlength="500" placeholder="details" disabled></td>
      </tr>`
  }).join('')

  const body = opts.alreadyConfirmed ? `
    <h1>Full Bloom Artelier</h1>
    <p>Delivery <strong>${h(snap.deliveryNumber)}</strong> was confirmed on ${h(new Date(opts.alreadyConfirmed.at).toLocaleDateString('en-GB'))}. Thank you.</p>` : `
    <h1>Full Bloom Artelier</h1>
    <p class="muted">Delivery confirmation for <strong>${h(snap.deliveryNumber)}</strong>${snap.orderNumber ? ` · Order ${h(snap.orderNumber)}` : ''}</p>
    <p style="margin:14px 0 4px">Please check the items received, note any shortages or damages, sign, and submit. Either the site contact or the client may confirm this delivery.</p>

    <form id="podForm">
      <h3 class="sec">Items</h3>
      <table>
        <thead><tr><th>Item</th><th class="num">Qty</th><th>Condition</th><th>Qty affected</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <h3 class="sec">Received by</h3>
      <div class="grid2">
        <label>Your name *<input name="name" required maxlength="200"></label>
        <label>Role / company<input name="role" maxlength="200"></label>
      </div>
      <label style="display:block;margin-top:12px">Condition notes (optional)<textarea name="conditionNotes" rows="3" maxlength="2000"></textarea></label>

      <h3 class="sec">Signature *</h3>
      <canvas id="sig" width="640" height="180"></canvas>
      <div><button type="button" class="btn ghost sm" onclick="clearSig()">Clear signature</button></div>

      <h3 class="sec">Photos (optional, up to 4)</h3>
      <input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple>

      <div style="margin-top:22px;display:flex;gap:12px;align-items:center">
        <button class="btn" type="submit" id="submitBtn">Confirm delivery</button>
        <span id="msg" class="muted"></span>
      </div>
    </form>`

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Delivery confirmation — Full Bloom Artelier</title>
<style>
  *{box-sizing:border-box} body{font-family:Georgia,'Times New Roman',serif;color:#2c2c28;background:#EFEFEA;margin:0;padding:24px}
  .doc{max-width:860px;margin:0 auto;background:#fff;padding:40px 48px;border-top:4px solid #1B4332}
  h1{color:#1B4332;font-size:20px;letter-spacing:.16em;text-transform:uppercase;margin:0 0 4px;font-weight:normal}
  h3.sec{color:#1B4332;font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin:22px 0 8px;font-weight:normal;border-bottom:1px solid #e6e6df;padding-bottom:4px}
  .muted{color:#6b6b64} .sm{font-size:12px}
  table{width:100%;border-collapse:collapse;margin:6px 0} th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #e6e6df;font-size:14px;vertical-align:top}
  th{color:#6b6b64;text-transform:uppercase;letter-spacing:.08em;font-size:11px} td.num,th.num{text-align:right}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media (max-width:640px){.grid2{grid-template-columns:1fr}}
  label{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#555550;display:block}
  input,textarea,select{font-family:inherit;font-size:15px;padding:9px;border:1px solid #cfcfc7;width:100%;margin-top:4px;background:#fff}
  input[type=file]{padding:6px;border:1px dashed #cfcfc7}
  input:disabled{background:#f4f4ef}
  canvas#sig{border:1px dashed #9a968c;background:#fff;width:100%;max-width:640px;touch-action:none;display:block}
  .btn{display:inline-block;background:#1B4332;color:#fff;padding:12px 26px;border-radius:2px;border:none;cursor:pointer;font-family:inherit;font-size:15px}
  .btn.ghost{background:#fff;color:#1B4332;border:1px solid #1B4332} .btn.sm{padding:6px 14px;font-size:13px;margin-top:6px}
  .btn:disabled{opacity:.55;cursor:default}
</style></head><body><div class="doc">${body}</div>
${opts.alreadyConfirmed ? '' : `<script>
(function(){
  // Enable qty/notes only when an exception type is chosen.
  document.querySelectorAll('#podForm tbody tr').forEach(function(tr){
    var sel = tr.querySelector('select[name=exc-type]')
    var qty = tr.querySelector('input[name=exc-qty]')
    var notes = tr.querySelector('input[name=exc-notes]')
    sel.addEventListener('change', function(){
      var on = !!sel.value
      qty.disabled = !on; notes.disabled = !on
      if (!on) { qty.value=''; notes.value='' } else if (!qty.value) { qty.value = 1 }
    })
  })

  // Signature pad.
  var canvas = document.getElementById('sig')
  var ctx = canvas.getContext('2d')
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1B4332'
  var drawing = false, drawn = false
  function pos(e){
    var r = canvas.getBoundingClientRect()
    var p = e.touches ? e.touches[0] : e
    return { x: (p.clientX - r.left) * (canvas.width / r.width), y: (p.clientY - r.top) * (canvas.height / r.height) }
  }
  function start(e){ drawing = true; drawn = true; var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault() }
  function move(e){ if(!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault() }
  function end(){ drawing = false }
  canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end)
  canvas.addEventListener('touchstart', start, {passive:false}); canvas.addEventListener('touchmove', move, {passive:false}); canvas.addEventListener('touchend', end)
  window.clearSig = function(){ ctx.clearRect(0,0,canvas.width,canvas.height); drawn = false }

  document.getElementById('podForm').addEventListener('submit', async function(e){
    e.preventDefault()
    var msg = document.getElementById('msg')
    var btn = document.getElementById('submitBtn')
    var form = e.target
    if (!form.name.value.trim()) { msg.textContent = 'Please enter your name.'; return }
    if (!drawn) { msg.textContent = 'Please sign in the signature box.'; return }

    var fd = new FormData()
    var receivedBy = form.name.value.trim() + (form.role.value.trim() ? ' (' + form.role.value.trim() + ')' : '')
    fd.append('name', receivedBy)
    fd.append('conditionNotes', form.conditionNotes.value)

    var exceptions = []
    document.querySelectorAll('#podForm tbody tr').forEach(function(tr){
      var t = tr.querySelector('select[name=exc-type]').value
      if (!t) return
      exceptions.push({
        deliveryLineId: tr.getAttribute('data-line'),
        type: t,
        quantityAffected: Number(tr.querySelector('input[name=exc-qty]').value || 1),
        notes: tr.querySelector('input[name=exc-notes]').value || null,
      })
    })
    fd.append('exceptions', JSON.stringify(exceptions))

    var sigBlob = await new Promise(function(res){ canvas.toBlob(res, 'image/png') })
    if (sigBlob) fd.append('signature', sigBlob, 'signature.png')

    var files = document.getElementById('photos').files
    for (var i = 0; i < Math.min(files.length, 4); i++) fd.append('photos', files[i])

    btn.disabled = true; msg.textContent = 'Submitting…'
    try {
      var res = await fetch(${JSON.stringify(opts.tokenPath)}, { method: 'POST', body: fd })
      var data = await res.json()
      if (data.success) {
        document.querySelector('.doc').innerHTML = '<h1>Full Bloom Artelier</h1><p>' + (data.message || 'Thank you — this delivery has been confirmed.') + '</p>'
      } else { btn.disabled = false; msg.textContent = data.error || 'Submission failed. Please try again.' }
    } catch (err) { btn.disabled = false; msg.textContent = 'Submission failed. Please try again.' }
  })
})()
</script>`}
</body></html>`
}
