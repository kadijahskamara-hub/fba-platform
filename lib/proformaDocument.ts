// ============================================================
// FBA branded Proforma / Invoice document renderer.
// Produces a print-ready A4 HTML page (staff use "Download PDF"
// → browser print-to-PDF) following FBA_Brand_Guidelines:
// Georgia serif, Forest Green #1B4332, off-white label tables,
// spaced-caps section headings with green rules.
// Server-side only (imported by the document API route).
// ============================================================

export type DocType = 'proforma' | 'invoice'
export type Audience = 'client' | 'manufacturer'

export interface DocSettings {
  company_name: string
  tagline: string
  email: string
  phone: string
  website: string
  address: string
  company_number: string
  vat_number: string
  bank_name: string
  bank_account: string
  bank_sort_code: string
  payment_terms: string
  default_lead_time: string
}

export const DEFAULT_DOC_SETTINGS: DocSettings = {
  company_name: 'Full Bloom Artelier',
  tagline: 'Design Procurement Studio, London',
  email: 'info@fullbloom.uk.com',
  phone: '[Phone number]',
  website: 'fullbloom.uk.com',
  address: '[Registered address]',
  company_number: '[Company No.]',
  vat_number: '[VAT No.]',
  bank_name: '[Bank name]',
  bank_account: '[Account number]',
  bank_sort_code: '[Sort code]',
  payment_terms:
    'A 50% deposit is required to confirm an order. The balance is due and cleared five working days before dispatch or delivery. Orders under £2,000 require full payment on confirmation.',
  default_lead_time: '10–14 weeks, depending on maker capacity and material stock at the time of order',
}

export interface DocLineItem {
  name: string
  description: string | null
  is_bespoke: boolean
  quantity: number
  unit_price: number | null
  selected_finish: string | null
  selected_fabric: string | null
  selected_size: string | null
  spec_details: string | null
  notes: string | null
  section: string | null
  image_url: string | null
  manufacturer_id: string | null
  manufacturer_name_resolved: string | null
}

export interface DocProforma {
  proforma_number: string
  invoice_number: string | null
  invoice_date: string | null
  invoice_due_date: string | null
  client_name: string | null
  client_email: string | null
  client_company: string | null
  project_name: string | null
  project_location: string | null
  currency: string
  notes: string | null
  valid_until: string | null
  vat_rate: number
  deposit_percent: number
  lead_time: string | null
  delivery_notes: string | null
  payment_terms: string | null
  created_at: string
  items: DocLineItem[]
}

/** Escape user-supplied values before interpolating into HTML. */
export function h(str: unknown): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }

function money(n: number | null | undefined, cur: string): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return `${sym(cur)}${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return h(d)
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Multiline text → escaped HTML with <br> line breaks. */
function multiline(str: string | null | undefined): string {
  if (!str) return ''
  return h(str).replace(/\r?\n/g, '<br>')
}

/** Safe document filename: FBA_[DocType]_[ClientOrContext]_[YYYY-MM] */
export function docFilename(doc: DocProforma, docType: DocType, audience: Audience, manufacturerName?: string | null): string {
  const context = audience === 'manufacturer'
    ? (manufacturerName || 'Manufacturer')
    : (doc.client_company || doc.client_name || doc.project_name || 'Client')
  const slug = context.replace(/[^A-Za-z0-9]+/g, '') .slice(0, 40) || 'Client'
  const ym = new Date().toISOString().slice(0, 7)
  const type = docType === 'invoice' ? 'Invoice' : 'Proforma'
  const suffix = audience === 'manufacturer' ? '_MakerCopy' : ''
  return `FBA_${type}_${slug}_${ym}${suffix}`
}

// FBA-tailored terms & conditions (client-facing documents only).
const FBA_TERMS: { heading: string; points: string[] }[] = [
  {
    heading: 'Quotations & validity',
    points: [
      'Unless otherwise stated, proforma invoices and quotations are valid for 30 days from the date of issue.',
      'Full Bloom Artelier reserves the right to adjust quoted prices prior to order confirmation where exchange rates, material costs, or maker pricing change beyond our control.',
      'By paying a deposit or instructing Full Bloom Artelier to proceed, the client commits to the full order value.',
    ],
  },
  {
    heading: 'Specifications & approvals',
    points: [
      'The client must verify all order details — materials, finishes, fabrics, dimensions, and quantities — before confirming. Confirmed specifications form the basis of the commission.',
      'Bespoke and made-to-order pieces are produced against the agreed specification and, where applicable, an approved Golden Sample. Each piece is accompanied by its Technical Passport™ recording specification, materials, and compliance.',
      'Advice on suitability of products for a particular setting is given in good faith and for guidance only; the client must satisfy themselves as to fitness for their specific use.',
    ],
  },
  {
    heading: 'Deposits & payment',
    points: [
      'Unless otherwise agreed in writing, a 50% deposit is required to confirm an order, with the balance due and cleared five working days before dispatch or delivery. Orders under £2,000 require full payment on confirmation.',
      'All goods remain the property of Full Bloom Artelier until payment has been received in full.',
      'We reserve the right to charge interest on overdue amounts and to suspend delivery or production where payment is outstanding.',
    ],
  },
  {
    heading: 'Changes & cancellations',
    points: [
      'Because our pieces are made to order by independent makers, changes or cancellations requested more than 48 hours after order confirmation may incur costs, which are the client’s responsibility.',
      'Bespoke, customised, and made-to-order items cannot be cancelled or returned once production has begun.',
    ],
  },
  {
    heading: 'Lead times & delivery',
    points: [
      'Lead times are estimates given in good faith and depend on maker capacity and material availability; they are not guaranteed dates. We will keep the client informed of any material change.',
      'The client is responsible for ensuring the delivery site is ready and accessible. Additional costs arising from failed, delayed, or restricted deliveries (including re-delivery and storage) will be charged at cost.',
      'Where goods are ready but delivery is delayed at the client’s request, we may invoice the outstanding balance and charge storage from one week after the ready-for-dispatch date.',
    ],
  },
  {
    heading: 'Damage & claims',
    points: [
      'Goods must be inspected on delivery. Claims for loss, non-delivery, or transit damage must be made in writing within two working days of receipt.',
      'For valid claims we will repair, replace, or — where necessary — reimburse the affected item.',
    ],
  },
  {
    heading: 'Guarantee',
    points: [
      'Full Bloom Artelier guarantees supplied pieces against manufacturing faults for 12 months from delivery.',
      'The guarantee is conditional on reasonable care in line with the guidance in the piece’s Technical Passport™, and excludes fair wear and tear, misuse, and client-altered items.',
    ],
  },
]

export interface RenderOptions {
  docType: DocType
  audience: Audience
  manufacturerName?: string | null
  /** POST endpoint used to log the download when the button is pressed. */
  logEndpoint: string
  logPayload: Record<string, unknown>
}

export function renderDocumentHtml(doc: DocProforma, settings: DocSettings, opts: RenderOptions): string {
  const cur = doc.currency || 'GBP'
  const isInvoice = opts.docType === 'invoice'
  const isMaker = opts.audience === 'manufacturer'
  const docTitle = isInvoice ? 'Invoice' : 'Pro Forma Invoice'
  const docNumber = isInvoice ? (doc.invoice_number ?? doc.proforma_number) : doc.proforma_number
  const filename = docFilename(doc, opts.docType, opts.audience, opts.manufacturerName)

  // ── Items: filter for manufacturer copy, group by section ──
  const items = isMaker
    ? doc.items.filter(it =>
        (opts.manufacturerName && it.manufacturer_name_resolved === opts.manufacturerName))
    : doc.items

  const sections = new Map<string, DocLineItem[]>()
  for (const it of items) {
    const key = (it.section || '').trim() || 'Items'
    if (!sections.has(key)) sections.set(key, [])
    sections.get(key)!.push(it)
  }

  const subtotal = items.reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 0), 0)
  const vatRate = Number(doc.vat_rate ?? 20)
  const vat = subtotal * vatRate / 100
  const total = subtotal + vat
  const depositPct = Number(doc.deposit_percent ?? 50)
  const deposit = total * depositPct / 100
  const balance = total - deposit

  // ── Line item rows ──
  const specLines = (it: DocLineItem): string => {
    const parts: string[] = []
    if (it.description) parts.push(multiline(it.description))
    if (it.selected_size) parts.push(`<span class="spec-label">Size:</span> ${h(it.selected_size)}`)
    if (it.selected_finish) parts.push(`<span class="spec-label">Finish:</span> ${h(it.selected_finish)}`)
    if (it.selected_fabric) parts.push(`<span class="spec-label">Fabric / Upholstery:</span> ${h(it.selected_fabric)}`)
    if (it.spec_details) parts.push(multiline(it.spec_details))
    if (it.notes) parts.push(`<span class="item-note"><span class="spec-label">Note:</span> ${multiline(it.notes)}</span>`)
    return parts.join('<br>')
  }

  const sectionBlocks = [...sections.entries()].map(([name, secItems]) => {
    const rows = secItems.map(it => {
      const line = (Number(it.unit_price) || 0) * (Number(it.quantity) || 0)
      return `
      <tr>
        <td class="c-item">
          ${it.image_url ? `<img class="thumb" src="${h(it.image_url)}" alt="">` : ''}
          <div class="item-name">${h(it.name)}${it.is_bespoke ? ' <span class="bespoke">Bespoke</span>' : ''}</div>
        </td>
        <td class="c-spec">${specLines(it) || '<span class="muted">—</span>'}</td>
        <td class="c-qty">${h(it.quantity)}</td>
        <td class="c-num">${money(it.unit_price, cur)}</td>
        <td class="c-num">${money(it.unit_price == null ? null : line, cur)}</td>
      </tr>`
    }).join('')
    return `
    <div class="section-head">${h(name)}</div>
    <table class="items">
      <thead>
        <tr><th class="c-item">Item</th><th class="c-spec">Specification</th><th class="c-qty">Qty</th><th class="c-num">Unit Price</th><th class="c-num">Total</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
  }).join('')

  // ── Totals (client documents only) ──
  const totalsBlock = isMaker ? `
    <table class="totals">
      <tr class="grand"><td>Subtotal (ex VAT)</td><td class="c-num">${money(subtotal, cur)}</td></tr>
    </table>` : `
    <table class="totals">
      <tr><td>Total (ex VAT)</td><td class="c-num">${money(subtotal, cur)}</td></tr>
      <tr><td>VAT (${h(vatRate)}%)</td><td class="c-num">${money(vat, cur)}</td></tr>
      <tr class="grand"><td>Total</td><td class="c-num">${money(total, cur)}</td></tr>
      ${isInvoice ? `
      <tr><td>Deposit received (${h(depositPct)}%)</td><td class="c-num">${money(deposit, cur)}</td></tr>
      <tr class="grand"><td>Balance due</td><td class="c-num">${money(balance, cur)}</td></tr>` : `
      <tr><td>Deposit to proceed (${h(depositPct)}%)</td><td class="c-num">${money(deposit, cur)}</td></tr>
      <tr><td>Balance on completion</td><td class="c-num">${money(balance, cur)}</td></tr>`}
    </table>`

  // ── Meta table ──
  const metaRows: [string, string][] = isInvoice ? [
    ['Invoice Number', h(docNumber)],
    ['Invoice Date', fmtDate(doc.invoice_date ?? new Date().toISOString())],
    ['Payment Due', fmtDate(doc.invoice_due_date)],
    ['Proforma Ref.', h(doc.proforma_number)],
  ] : [
    ['Proforma Number', h(docNumber)],
    ['Date', fmtDate(new Date().toISOString())],
    ['Valid Until', fmtDate(doc.valid_until)],
  ]

  const paymentTerms = doc.payment_terms || settings.payment_terms
  const leadTime = doc.lead_time || settings.default_lead_time

  const detailRows: [string, string][] = []
  if (!isMaker) {
    if (!isInvoice) detailRows.push(['Lead Time', multiline(leadTime)])
    detailRows.push(['Payment Terms', multiline(paymentTerms)])
    detailRows.push(['Bank Account', `${h(settings.bank_name)} &nbsp;·&nbsp; Account No: ${h(settings.bank_account)} &nbsp;·&nbsp; Sort Code: ${h(settings.bank_sort_code)}<br><em>Please use “${h(docNumber)}” as the payment reference.</em>`])
  }
  if (doc.delivery_notes) detailRows.push(['Delivery', multiline(doc.delivery_notes)])
  if (doc.notes) detailRows.push(['Notes', multiline(doc.notes)])

  const termsBlock = isMaker ? '' : `
  <div class="terms">
    <div class="section-head">Terms &amp; Conditions</div>
    <p class="terms-intro">Within these terms, “Full Bloom Artelier”, “FBA”, and “we” mean Full Bloom Artelier and “the client” means our contractual counterparty. These terms apply in addition to any terms stated on the face of this document.</p>
    ${FBA_TERMS.map(t => `
      <div class="terms-group">
        <div class="terms-heading">${h(t.heading)}</div>
        <ul>${t.points.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>`).join('')}
  </div>`

  const badge = isMaker
    ? `<div class="copy-badge">Manufacturer copy — ${h(opts.manufacturerName ?? '')}</div>`
    : ''

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
  .sheet { max-width: 180mm; margin: 0 auto; background: var(--white); padding: 14mm 12mm; }
  @media print {
    html { background: var(--white); }
    .sheet { max-width: none; padding: 0; }
    .toolbar { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }

  /* Toolbar (screen only) */
  .toolbar { position: sticky; top: 0; z-index: 10; background: var(--forest); color: #fff; padding: 10px 16px; display: flex; align-items: center; gap: 14px; font-size: 12px; }
  .toolbar .fn { opacity: 0.75; letter-spacing: 0.06em; }
  .toolbar button { margin-left: auto; background: #fff; color: var(--forest); border: none; font-family: Georgia, serif; font-size: 13px; padding: 8px 18px; cursor: pointer; letter-spacing: 0.08em; }
  .toolbar button:hover { background: var(--tint); }

  /* Header */
  .doc-header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5px solid var(--forest); padding-bottom: 10px; }
  .wordmark { font-size: 15pt; letter-spacing: 0.32em; text-transform: uppercase; color: var(--forest); }
  .wordmark small { display: block; font-size: 7.5pt; letter-spacing: 0.22em; color: var(--light); font-style: italic; margin-top: 3px; text-transform: none; }
  .doc-type { font-size: 9pt; letter-spacing: 0.3em; text-transform: uppercase; color: var(--forest); text-align: right; }
  .copy-badge { display: inline-block; margin-top: 10px; background: var(--tint); color: var(--forest); font-size: 8pt; letter-spacing: 0.14em; text-transform: uppercase; padding: 4px 10px; }

  h1.title { font-size: 26pt; font-weight: normal; color: var(--forest); margin: 26px 0 2px; }
  .subtitle { font-size: 10pt; font-style: italic; color: var(--body); margin-bottom: 20px; }

  /* Label/value tables per brand guide */
  table.kv { width: 100%; border-collapse: collapse; border-top: 0.5pt solid var(--midgrey); border-bottom: 0.5pt solid var(--midgrey); margin-bottom: 18px; }
  table.kv td { padding: 5px 8px; vertical-align: top; border-bottom: 0.5pt solid var(--midgrey); }
  table.kv tr:last-child td { border-bottom: none; }
  table.kv td.k { width: 55mm; background: var(--offwhite); font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase; color: var(--body); border-right: 0.5pt solid var(--midgrey); }
  table.kv td.v { font-size: 10pt; color: var(--forest); }

  .addr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; margin-bottom: 18px; }

  .section-head { font-size: 9pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--forest); border-bottom: 0.5pt solid var(--forest); padding-bottom: 4px; margin: 24px 0 8px; }

  /* Items */
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  table.items th { font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: var(--body); background: var(--offwhite); text-align: left; padding: 6px 8px; border-bottom: 0.5pt solid var(--midgrey); }
  table.items td { padding: 9px 8px; border-bottom: 0.5pt solid var(--midgrey); vertical-align: top; font-size: 9pt; }
  table.items tr { page-break-inside: avoid; }
  .c-item { width: 34mm; }
  .c-qty { width: 12mm; text-align: center; }
  .c-num { width: 24mm; text-align: right; white-space: nowrap; }
  th.c-qty { text-align: center; } th.c-num { text-align: right; }
  .thumb { width: 26mm; height: 26mm; object-fit: cover; background: var(--tint); display: block; margin-bottom: 5px; }
  .item-name { color: var(--forest); font-size: 9.5pt; }
  .bespoke { font-size: 7pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--light); }
  .spec-label { font-size: 8pt; letter-spacing: 0.05em; text-transform: uppercase; color: var(--light); }
  .item-note { display: inline-block; background: var(--tint); padding: 2px 6px; margin-top: 3px; color: var(--forest); }
  .muted { color: var(--light); }

  /* Totals */
  table.totals { border-collapse: collapse; margin: 14px 0 4px auto; min-width: 78mm; }
  table.totals td { padding: 5px 8px; border-bottom: 0.5pt solid var(--midgrey); font-size: 9.5pt; }
  table.totals td:first-child { font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase; color: var(--body); padding-right: 22px; }
  table.totals tr.grand td { color: var(--forest); font-size: 11pt; border-bottom: 1pt solid var(--forest); }

  /* Terms */
  .terms { page-break-before: always; }
  .terms-intro { font-size: 8.5pt; color: var(--light); margin-bottom: 12px; }
  .terms-group { margin-bottom: 10px; page-break-inside: avoid; }
  .terms-heading { font-size: 8.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: var(--forest); margin-bottom: 3px; }
  .terms ul { margin-left: 14px; }
  .terms li { font-size: 8.5pt; margin-bottom: 3px; }

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
  <div class="doc-header">
    <div class="wordmark">Full Bloom Artelier<small>${h(settings.tagline)}</small></div>
    <div class="doc-type">${h(docTitle)}<br><span style="color:var(--light);letter-spacing:0.1em">${h(docNumber)}</span></div>
  </div>
  ${badge}

  <h1 class="title">${h(docTitle)}</h1>
  <div class="subtitle">${doc.project_name ? `${h(doc.project_name)}${doc.project_location ? ` · ${h(doc.project_location)}` : ''}` : h(settings.tagline)}</div>

  <table class="kv">
    ${metaRows.map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join('')}
  </table>

  <div class="addr-grid">
    <div>
      <div class="section-head" style="margin-top:0">${isMaker ? 'Commissioned By' : 'Client'}</div>
      <table class="kv">
        ${doc.client_company ? `<tr><td class="k">Company</td><td class="v">${h(doc.client_company)}</td></tr>` : ''}
        <tr><td class="k">Name</td><td class="v">${h(doc.client_name) || '—'}</td></tr>
        ${doc.client_email && !isMaker ? `<tr><td class="k">Email</td><td class="v">${h(doc.client_email)}</td></tr>` : ''}
      </table>
    </div>
    <div>
      <div class="section-head" style="margin-top:0">Project</div>
      <table class="kv">
        <tr><td class="k">Project</td><td class="v">${h(doc.project_name) || '—'}</td></tr>
        <tr><td class="k">Location</td><td class="v">${h(doc.project_location) || '—'}</td></tr>
      </table>
    </div>
  </div>

  ${sectionBlocks || '<p class="muted">No line items.</p>'}

  ${totalsBlock}

  ${detailRows.length ? `
  <div class="section-head">Payment &amp; Delivery</div>
  <table class="kv">
    ${detailRows.map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join('')}
  </table>` : ''}

  ${termsBlock}

  <div class="doc-footer">
    <span>${h(settings.company_name)} · ${h(docTitle)} ${h(docNumber)} · ${h(settings.website)} · ${h(settings.email)}</span>
    <span>Company No: ${h(settings.company_number)} · VAT No: ${h(settings.vat_number)}</span>
  </div>
</div>
<script>
  var FBA_LOG = { endpoint: ${JSON.stringify(opts.logEndpoint)}, payload: ${JSON.stringify(opts.logPayload)} };
  async function fbaDownload() {
    try {
      await fetch(FBA_LOG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(FBA_LOG.payload) })
    } catch (e) { /* logging must never block the download */ }
    window.print()
  }
</script>
</body>
</html>`
}
