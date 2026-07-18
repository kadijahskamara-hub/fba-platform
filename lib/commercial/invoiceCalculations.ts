// ============================================================
// Client-side invoice calculation engine (Sprint 3).
//
// Pure module (no server imports) reusing the Sprint 1 minor-unit
// money utilities. Client invoices carry SELLING prices only —
// supplier cost, FBA markup and margin never appear here. Server
// calculations are authoritative; browser-submitted totals that do
// not reconcile are rejected by the caller.
// ============================================================

import { toMinor, fromMinor, roundHalfUp } from './calculations'
import type { TaxCategory } from './types'

export type InvoiceType = 'deposit' | 'stage' | 'final' | 'service' | 'adjustment'
export type DepositBasis = 'gross_total' | 'net_subtotal'

// ── Line + document calculation ──────────────────────────────

export interface InvoiceLineInput {
  id?: string
  quantity: number
  unitPrice: number          // client selling price per unit (major units)
  discountAmount: number     // absolute per line (major units)
  taxCategory: TaxCategory
  taxRate: number | null     // rate for standard/reduced; others → 0
}

export interface InvoiceLineResult {
  id?: string
  quantity: number
  unitPrice: number
  lineSubtotal: number
  discountAmount: number
  lineNetTotal: number
  taxCategory: TaxCategory
  taxRate: number
  lineTaxTotal: number
  lineGrossTotal: number
}

function invoiceTaxRateFor(category: TaxCategory, rate: number | null): number {
  return (category === 'standard' || category === 'reduced') ? (rate ?? 0) : 0
}

export function calculateInvoiceLine(input: InvoiceLineInput): InvoiceLineResult {
  const qty = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 0
  const priceMinor = toMinor(input.unitPrice)
  const subtotalMinor = roundHalfUp(priceMinor * qty)
  const discountMinor = Math.min(Math.max(toMinor(input.discountAmount ?? 0), 0), subtotalMinor)
  const netMinor = subtotalMinor - discountMinor
  const rate = invoiceTaxRateFor(input.taxCategory, input.taxRate)
  const taxMinor = roundHalfUp((netMinor * rate) / 100)
  return {
    id: input.id,
    quantity: qty,
    unitPrice: fromMinor(priceMinor),
    lineSubtotal: fromMinor(subtotalMinor),
    discountAmount: fromMinor(discountMinor),
    lineNetTotal: fromMinor(netMinor),
    taxCategory: input.taxCategory,
    taxRate: rate,
    lineTaxTotal: fromMinor(taxMinor),
    lineGrossTotal: fromMinor(netMinor + taxMinor),
  }
}

export interface CalcInvoiceInput {
  lines: InvoiceLineInput[]
  vatRegistered: boolean
}

export interface CalcInvoiceResult {
  lines: InvoiceLineResult[]
  subtotal: number
  taxByCategory: Partial<Record<TaxCategory, number>>
  taxTotal: number
  grossTotal: number
}

export function calculateInvoice(input: CalcInvoiceInput): CalcInvoiceResult {
  const lines = input.lines.map(calculateInvoiceLine)
  const netMinor = lines.reduce((s, l) => s + toMinor(l.lineNetTotal), 0)

  const taxByCategory: Partial<Record<TaxCategory, number>> = {}
  let taxMinor = 0
  if (input.vatRegistered) {
    for (const l of lines) {
      const m = toMinor(l.lineTaxTotal)
      if (m !== 0) taxByCategory[l.taxCategory] = (taxByCategory[l.taxCategory] ?? 0) + fromMinor(m)
      taxMinor += m
    }
  }
  return {
    lines,
    subtotal: fromMinor(netMinor),
    taxByCategory,
    taxTotal: fromMinor(taxMinor),
    grossTotal: fromMinor(netMinor + taxMinor),
  }
}

// ── Balances, status, overdue (pure mirrors of the SQL) ──────

/** Outstanding balance = gross − confirmed payments − allocated credits. */
export function invoiceBalance(grossTotal: number, amountPaid: number, creditTotal: number): number {
  return fromMinor(toMinor(grossTotal) - toMinor(amountPaid) - toMinor(creditTotal))
}

export type InvoiceMoneyStatus = 'issued' | 'partially_paid' | 'paid' | 'credited' | 'overdue'

/** Derive the money-status of an ISSUED invoice from its allocations. */
export function deriveInvoiceStatus(params: {
  grossTotal: number
  amountPaid: number
  creditTotal: number
  dueDate: string | null
  today?: string
}): InvoiceMoneyStatus {
  const balance = invoiceBalance(params.grossTotal, params.amountPaid, params.creditTotal)
  if (balance <= 0 && params.grossTotal > 0) {
    return (params.creditTotal > 0 && params.amountPaid === 0) ? 'credited' : 'paid'
  }
  if (params.amountPaid > 0 || params.creditTotal > 0) return 'partially_paid'
  if (isOverdue({ locked: true, balanceDue: balance, dueDate: params.dueDate, today: params.today })) return 'overdue'
  return 'issued'
}

/** Overdue iff issued, balance owing, and due date has passed. Paid invoices are never overdue. */
export function isOverdue(params: {
  locked: boolean
  balanceDue: number
  dueDate: string | null
  today?: string
}): boolean {
  if (!params.locked) return false
  if (params.balanceDue <= 0) return false
  if (!params.dueDate) return false
  const today = params.today ?? new Date().toISOString().slice(0, 10)
  return params.dueDate < today
}

// ── Deposit calculation ──────────────────────────────────────

export function calculateDeposit(params: {
  netSubtotal: number
  grossTotal: number
  depositPercent: number
  basis: DepositBasis
  override?: number | null
}): number {
  if (params.override != null && Number.isFinite(params.override) && params.override >= 0) {
    return fromMinor(toMinor(params.override))
  }
  const baseMinor = params.basis === 'net_subtotal' ? toMinor(params.netSubtotal) : toMinor(params.grossTotal)
  return fromMinor(roundHalfUp((baseMinor * params.depositPercent) / 100))
}

// ── Remaining invoiceable / over-invoicing guard ─────────────

export interface OrderInvoiceState {
  orderGross: number
  approvedVariations: number   // approved client variations (may be negative)
  priorInvoiced: number        // gross of prior non-void invoices
  creditNotes: number          // issued credit notes against the order
}

/** accepted order gross + variations − prior invoices − credit notes. */
export function remainingInvoiceable(s: OrderInvoiceState): number {
  return fromMinor(
    toMinor(s.orderGross) + toMinor(s.approvedVariations) - toMinor(s.priorInvoiced) - toMinor(s.creditNotes),
  )
}

/** Guard: a new invoice of `requested` gross must not exceed the remaining invoiceable amount. */
export function assertInvoiceable(requested: number, s: OrderInvoiceState): { ok: boolean; remaining: number; error?: string } {
  const remaining = remainingInvoiceable(s)
  if (toMinor(requested) > toMinor(remaining)) {
    return { ok: false, remaining, error: `Invoice of ${requested.toFixed(2)} exceeds the remaining invoiceable amount (${remaining.toFixed(2)}).` }
  }
  return { ok: true, remaining }
}

// ── Allocation caps (pure mirrors of the atomic SQL functions) ──

export function checkPaymentAllocation(params: {
  paymentCurrency: string
  invoiceCurrency: string
  paymentAmount: number
  alreadyAllocatedOnPayment: number
  invoiceOutstanding: number
  requested: number
}): { ok: boolean; error?: string } {
  if (params.requested <= 0) return { ok: false, error: 'Allocation amount must be positive.' }
  if (params.paymentCurrency !== params.invoiceCurrency) return { ok: false, error: 'Currency mismatch between payment and invoice.' }
  const free = toMinor(params.paymentAmount) - toMinor(params.alreadyAllocatedOnPayment)
  if (toMinor(params.requested) > free) return { ok: false, error: 'Allocation exceeds the unallocated payment balance.' }
  if (toMinor(params.requested) > toMinor(params.invoiceOutstanding)) return { ok: false, error: 'Allocation exceeds the invoice outstanding balance.' }
  return { ok: true }
}

export function checkCreditNoteAmount(params: {
  creditNoteGross: number
  eligibleInvoiceAmount: number
}): { ok: boolean; error?: string } {
  if (toMinor(params.creditNoteGross) > toMinor(params.eligibleInvoiceAmount)) {
    return { ok: false, error: 'Credit note exceeds the eligible invoice amount.' }
  }
  return { ok: true }
}

// ── Client-safe output guard ─────────────────────────────────

/** Field names that must NEVER appear in a client invoice/statement payload. */
export const CLIENT_INVOICE_FORBIDDEN_FIELDS = [
  'supplier_cost', 'supplier_cost_unit', 'supplier_cost_total', 'line_cost_total',
  'markup', 'markupPercent', 'pricing_percent', 'margin', 'marginPercent',
  'effectiveMarginPercent', 'effectiveMarkupPercent', 'fba_margin', 'margin_analysis',
] as const

export function findForbiddenClientInvoiceFields(obj: unknown, path = ''): string[] {
  const hits: string[] = []
  if (obj === null || typeof obj !== 'object') return hits
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k
    if ((CLIENT_INVOICE_FORBIDDEN_FIELDS as readonly string[]).includes(k)) hits.push(p)
    if (v && typeof v === 'object') hits.push(...findForbiddenClientInvoiceFields(v, p))
  }
  return hits
}

// ── Payment allocation party matching & exceptions ───────────
//
// Sprint 16. A payment and an invoice may be linked to a client
// record, a commercial order, or (in the quote→proforma→order
// flow) neither — orders carry a client_snapshot rather than a
// client_id. Matching on client_id alone silently hid every
// candidate invoice, which is why allocation appeared impossible.

export interface AllocationParty {
  clientId?: string | null
  commercialOrderId?: string | null
}

/**
 * True when a payment and an invoice belong to the same party.
 * Matches on client when BOTH sides carry one, otherwise falls
 * back to the commercial order. Two nulls never match — an
 * unattached payment must be attached before it can be allocated.
 */
export function allocationPartyMatches(payment: AllocationParty, invoice: AllocationParty): boolean {
  if (payment.clientId && invoice.clientId) return payment.clientId === invoice.clientId
  if (payment.commercialOrderId && invoice.commercialOrderId) {
    return payment.commercialOrderId === invoice.commercialOrderId
  }
  return false
}

/** Human-readable reason a payment has no allocation candidates. */
export function noCandidateReason(params: {
  paymentStatus: string
  unallocated: number
  hasParty: boolean
  candidateCount: number
}): string | null {
  if (params.paymentStatus !== 'confirmed') {
    return `This payment is ${params.paymentStatus}. Only confirmed payments can be allocated.`
  }
  if (params.unallocated <= 0.005) return null
  if (!params.hasParty) {
    return 'This payment is not linked to a client or a commercial order, so no invoices can be matched to it. Attach it to an order first.'
  }
  if (params.candidateCount === 0) {
    return 'No issued invoices with an outstanding balance and matching currency were found for this client or order. A draft invoice must be issued before payment can be allocated to it.'
  }
  return null
}

export interface UnallocatedPaymentRow {
  reference: string
  status: string
  amount: number
  allocatedTotal: number
}

/**
 * Confirmed payments carrying money that has not been applied to
 * any invoice. Mirrors the Operations "Workload & Open Items"
 * detector so the reconciliation report cannot contradict it.
 */
export function unallocatedPaymentExceptions(
  rows: UnallocatedPaymentRow[],
): Array<{ reference: string; unallocated: number; kind: 'payment_unallocated' | 'payment_part_allocated' }> {
  const out: Array<{ reference: string; unallocated: number; kind: 'payment_unallocated' | 'payment_part_allocated' }> = []
  for (const r of rows) {
    if (r.status !== 'confirmed') continue
    const free = fromMinor(toMinor(r.amount) - toMinor(r.allocatedTotal))
    if (free <= 0.005) continue
    out.push({
      reference: r.reference,
      unallocated: free,
      kind: r.allocatedTotal > 0.005 ? 'payment_part_allocated' : 'payment_unallocated',
    })
  }
  return out
}

/**
 * Derive the figures shown on BOTH sides of an allocation.
 *
 * `toThisInvoice` are the amounts allocated against the invoice in
 * question; `elsewhereOnPayment` are the same payment's allocations
 * to other invoices. Keeping them separate is what makes a split
 * payment add up: the invoice only counts its own share, while the
 * payment counts every share when working out what is left.
 */
export function applyAllocations(params: {
  grossTotal: number
  creditTotal?: number
  paymentAmount: number
  toThisInvoice: number[]
  elsewhereOnPayment?: number[]
}): { paid: number; balanceDue: number; allocated: number; unallocated: number } {
  const thisMinor = params.toThisInvoice.reduce((s, a) => s + toMinor(a), 0)
  const otherMinor = (params.elsewhereOnPayment ?? []).reduce((s, a) => s + toMinor(a), 0)
  const paid = fromMinor(thisMinor)
  return {
    paid,
    balanceDue: invoiceBalance(params.grossTotal, paid, params.creditTotal ?? 0),
    allocated: fromMinor(thisMinor + otherMinor),
    unallocated: fromMinor(toMinor(params.paymentAmount) - thisMinor - otherMinor),
  }
}
