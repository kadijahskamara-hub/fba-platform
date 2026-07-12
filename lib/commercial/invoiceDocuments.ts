// ============================================================
// Client-facing document renderers (Sprint 3).
// Pure string builders — invoices, receipts, statements and the
// client acceptance page. Client selling values only; supplier
// cost, FBA markup and margin never appear (guarded at runtime).
// ============================================================

import { findForbiddenClientInvoiceFields } from './invoiceCalculations'

const BRAND = { green: '#1B4332', paper: '#EFEFEA', ink: '#2c2c28', muted: '#6b6b64' }

export function esc(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function money(n: number, currency = 'GBP'): string {
  const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : ''
  return `${sym}${Number(n ?? 0).toFixed(2)}`
}

const shell = (title: string, body: string) => `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Georgia,'Times New Roman',serif;color:${BRAND.ink};background:${BRAND.paper};margin:0;padding:24px}
  .doc{max-width:820px;margin:0 auto;background:#fff;padding:48px 56px;border-top:4px solid ${BRAND.green}}
  h1{color:${BRAND.green};font-size:22px;letter-spacing:.16em;text-transform:uppercase;margin:0 0 4px;font-weight:normal}
  .muted{color:${BRAND.muted}} .row{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}
  table{width:100%;border-collapse:collapse;margin:24px 0} th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #e6e6df;font-size:14px}
  th{color:${BRAND.muted};text-transform:uppercase;letter-spacing:.08em;font-size:11px} td.num,th.num{text-align:right}
  .totals{margin-left:auto;width:320px} .totals td{border:none;padding:5px 8px} .totals .grand td{border-top:2px solid ${BRAND.green};font-weight:bold;font-size:16px}
  .pill{display:inline-block;padding:3px 12px;border-radius:999px;font-size:12px;letter-spacing:.06em;text-transform:uppercase}
  .btn{display:inline-block;background:${BRAND.green};color:#fff;padding:12px 26px;text-decoration:none;border-radius:2px;border:none;cursor:pointer;font-family:inherit;font-size:15px}
  .btn.ghost{background:#fff;color:${BRAND.green};border:1px solid ${BRAND.green}}
  input,textarea{font-family:inherit;font-size:15px;padding:10px;border:1px solid #cfcfc7;width:100%;margin-top:4px}
</style></head><body><div class="doc">${body}</div></body></html>`

interface InvoiceSnapshot {
  invoice_number?: string; invoice_type?: string; issue_date?: string; due_date?: string; currency?: string
  client?: Record<string, unknown>; project?: Record<string, unknown>; billing_address?: string
  company?: Record<string, unknown>; bank?: Record<string, unknown>; payment_terms?: string
  lines?: Array<Record<string, unknown>>; totals?: Record<string, unknown>
}

export function renderInvoiceDocument(snap: InvoiceSnapshot, live: { amountPaid: number; creditTotal: number; balanceDue: number }): string {
  // Defensive: never leak supplier cost / margin into a client document.
  const leaks = findForbiddenClientInvoiceFields(snap)
  if (leaks.length) throw new Error(`Refusing to render invoice: forbidden client fields present: ${leaks.join(', ')}`)

  const cur = snap.currency ?? 'GBP'
  const co = snap.company ?? {}
  const cl = snap.client ?? {}
  const bank = snap.bank ?? {}
  const typeLabel = (snap.invoice_type ?? 'final').toUpperCase()
  const rows = (snap.lines ?? []).map(l => `<tr>
    <td>${esc(l.name)}${l.description ? `<div class="muted" style="font-size:12px">${esc(l.description)}</div>` : ''}</td>
    <td class="num">${Number(l.quantity ?? 0)}</td>
    <td class="num">${money(Number(l.unit_price ?? 0), cur)}</td>
    <td class="num">${esc(l.tax_category)} ${Number(l.tax_rate ?? 0)}%</td>
    <td class="num">${money(Number(l.line_net_total ?? 0), cur)}</td></tr>`).join('')
  const t = snap.totals ?? {}
  return shell(`Invoice ${snap.invoice_number ?? ''}`, `
    <div class="row"><div><h1>Invoice</h1><div class="muted">${esc(typeLabel)} · ${esc(snap.invoice_number ?? 'DRAFT')}</div></div>
    <div style="text-align:right"><strong>${esc(co.legal_name)}</strong><div class="muted">${esc(co.address)}</div>
    <div class="muted">VAT ${esc(co.vat_number)}</div><div class="muted">${esc(co.email)}</div></div></div>
    <div class="row" style="margin-top:24px">
      <div><div class="muted">Billed to</div><strong>${esc(cl.company || cl.name)}</strong><div>${esc(cl.name)}</div>
      <div class="muted" style="white-space:pre-line">${esc(snap.billing_address)}</div></div>
      <div style="text-align:right"><div class="muted">Issue date</div><div>${esc(snap.issue_date)}</div>
      <div class="muted" style="margin-top:8px">Due date</div><div>${esc(snap.due_date)}</div>
      ${snap.project?.name ? `<div class="muted" style="margin-top:8px">Project</div><div>${esc(snap.project.name)}</div>` : ''}</div></div>
    <table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">VAT</th><th class="num">Net</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <table class="totals"><tbody>
      <tr><td class="muted">Subtotal</td><td class="num">${money(Number(t.subtotal ?? 0), cur)}</td></tr>
      <tr><td class="muted">VAT</td><td class="num">${money(Number(t.tax_total ?? 0), cur)}</td></tr>
      <tr class="grand"><td>Total</td><td class="num">${money(Number(t.gross_total ?? 0), cur)}</td></tr>
      ${live.amountPaid ? `<tr><td class="muted">Paid</td><td class="num">−${money(live.amountPaid, cur)}</td></tr>` : ''}
      ${live.creditTotal ? `<tr><td class="muted">Credited</td><td class="num">−${money(live.creditTotal, cur)}</td></tr>` : ''}
      <tr class="grand"><td>Balance due</td><td class="num">${money(live.balanceDue, cur)}</td></tr>
    </tbody></table>
    <div style="clear:both;margin-top:28px" class="muted">
      <strong>Payment</strong> · Terms: ${esc(snap.payment_terms ?? '')}<br>
      ${bank.bank_name ? `${esc(bank.bank_name)} · ${esc(bank.account_name)} · Acct ${esc(bank.account_number)} · Sort ${esc(bank.sort_code)}` : ''}<br>
      Reference: ${esc(snap.invoice_number)}
    </div>`)
}

export function renderReceipt(snap: Record<string, unknown>): string {
  const cur = (snap.currency as string) ?? 'GBP'
  const allocs = (snap.allocations as Array<Record<string, unknown>> ?? []).map(a =>
    `<tr><td>${esc(a.invoice_number ?? '—')}</td><td class="num">${money(Number(a.amount ?? 0), cur)}</td></tr>`).join('')
  const co = (snap.company as Record<string, unknown>) ?? {}
  return shell(`Receipt ${snap.receipt_number ?? ''}`, `
    <div class="row"><div><h1>Receipt</h1><div class="muted">${esc(snap.receipt_number)}</div></div>
    <div style="text-align:right"><strong>${esc(co.legal_name)}</strong><div class="muted">VAT ${esc(co.vat_number)}</div></div></div>
    <p class="muted" style="margin-top:20px">This is a payment receipt, not a VAT invoice.</p>
    <table><tbody>
      <tr><td class="muted">Amount received</td><td class="num"><strong>${money(Number(snap.amount ?? 0), cur)}</strong></td></tr>
      <tr><td class="muted">Date</td><td class="num">${esc(snap.payment_date)}</td></tr>
      <tr><td class="muted">Method</td><td class="num">${esc(snap.payment_method)}</td></tr>
      <tr><td class="muted">Reference</td><td class="num">${esc(snap.payment_reference)}</td></tr>
    </tbody></table>
    <h3 class="muted" style="text-transform:uppercase;letter-spacing:.08em;font-size:12px">Allocated to</h3>
    <table><thead><tr><th>Invoice</th><th class="num">Amount</th></tr></thead><tbody>${allocs || '<tr><td class="muted">Unallocated</td><td></td></tr>'}</tbody></table>
    <p class="muted">Unallocated remaining: ${money(Number(snap.unallocated_amount ?? 0), cur)}</p>`)
}

export interface StatementRow {
  date: string; type: string; reference: string; charge: number; paid: number; balance: number
}
export function renderStatement(data: {
  clientName: string; currency: string; rows: StatementRow[]
  totals: { invoiced: number; paid: number; credited: number; outstanding: number; overdue: number }
}): string {
  const cur = data.currency
  const rows = data.rows.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.type)}</td><td>${esc(r.reference)}</td>
    <td class="num">${r.charge ? money(r.charge, cur) : ''}</td><td class="num">${r.paid ? money(r.paid, cur) : ''}</td>
    <td class="num">${money(r.balance, cur)}</td></tr>`).join('')
  return shell(`Statement — ${data.clientName}`, `
    <h1>Statement of Account</h1><div class="muted">${esc(data.clientName)}</div>
    <table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th class="num">Charge</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="muted">No transactions.</td></tr>'}</tbody></table>
    <table class="totals"><tbody>
      <tr><td class="muted">Invoiced</td><td class="num">${money(data.totals.invoiced, cur)}</td></tr>
      <tr><td class="muted">Paid</td><td class="num">${money(data.totals.paid, cur)}</td></tr>
      <tr><td class="muted">Credited</td><td class="num">${money(data.totals.credited, cur)}</td></tr>
      <tr class="grand"><td>Outstanding</td><td class="num">${money(data.totals.outstanding, cur)}</td></tr>
      ${data.totals.overdue ? `<tr><td class="muted" style="color:#a33">Overdue</td><td class="num" style="color:#a33">${money(data.totals.overdue, cur)}</td></tr>` : ''}
    </tbody></table>`)
}

export function renderClientAcceptancePage(doc: Record<string, unknown>, opts: {
  tokenPath: string; companyName: string; alreadyResponded: { status: string } | null
}): string {
  const snap = (doc.snapshot ?? {}) as Record<string, unknown>
  const number = esc(doc.document_number)
  if (opts.alreadyResponded) {
    return shell('Full Bloom Artelier', `<h1>Full Bloom Artelier</h1>
      <p>Document <strong>${number}</strong> has already been <strong>${esc(opts.alreadyResponded.status)}</strong>. Thank you.</p>`)
  }
  const totals = (snap.totals ?? {}) as Record<string, unknown>
  const cur = (snap.currency as string) ?? 'GBP'
  return shell('Review & accept — Full Bloom Artelier', `
    <h1>Full Bloom Artelier</h1>
    <p class="muted">Please review document <strong>${number}</strong> and confirm your acceptance.</p>
    <table class="totals" style="float:none;width:100%;max-width:360px">
      <tbody><tr class="grand"><td>Total</td><td class="num">${money(Number(totals.grossTotal ?? totals.gross_total ?? 0), cur)}</td></tr></tbody></table>
    <form method="POST" action="${esc(opts.tokenPath)}" style="margin-top:24px">
      <label>Your name<input name="name" required maxlength="200"></label>
      <label style="display:block;margin-top:12px">Your email<input name="email" type="email" required maxlength="200"></label>
      <label style="display:block;margin-top:12px">Note (optional)<textarea name="note" rows="3" maxlength="2000"></textarea></label>
      <input type="hidden" name="action" value="accept">
      <div style="margin-top:20px;display:flex;gap:12px">
        <button class="btn" type="submit" name="action" value="accept">Accept</button>
        <button class="btn ghost" type="submit" name="action" value="decline">Decline</button>
      </div>
    </form>
    <p class="muted" style="margin-top:24px;font-size:12px">Your acceptance is recorded against this exact version (${number}).</p>`)
}
