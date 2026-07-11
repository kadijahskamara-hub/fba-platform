'use client'

// Shared UI primitives + client-side types for the commercial admin
// components. Client-side calculations here are PREVIEW ONLY — the
// server recalculates authoritatively on every save.

import { useEffect, useState } from 'react'

export function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }
export function money(n: number | null | undefined, cur: string) {
  return n == null || Number.isNaN(Number(n))
    ? '—'
    : `${sym(cur)}${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const box: React.CSSProperties = { background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 24, marginBottom: 20 }
export const inp: React.CSSProperties = { width: '100%', border: '1px solid var(--light-line)', borderRadius: 4, padding: '5px 7px', fontSize: 13, background: 'var(--warm-white)' }
export const th: React.CSSProperties = { textAlign: 'left', padding: '8px 8px', borderBottom: '2px solid var(--forest, #2d3a2e)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--stone)', whiteSpace: 'nowrap' }
export const td: React.CSSProperties = { padding: '8px 8px', borderBottom: '1px solid var(--light-line)', fontSize: 13, verticalAlign: 'top' }

// ── Client-side row/document types (API response shapes) ──

export type Manu = { id: string; name: string } | null

export interface LineItem {
  id: string
  line_type: 'product' | 'service' | 'fee' | 'delivery' | 'installation' | 'adjustment'
  product_id: string | null
  service_catalogue_id: string | null
  is_bespoke: boolean
  name: string
  description: string | null
  manufacturer_id: string | null
  manufacturer_name: string | null
  manufacturer: Manu
  service: { id: string; code: string; name: string; pricing_type: string; default_unit: string | null } | null
  quantity: number
  unit_of_measure: string
  supplier_cost_unit: number | null
  supplier_cost_source: string
  supplier_cost_overridden: boolean
  pricing_method: 'markup' | 'margin' | 'manual' | null
  pricing_percent: number | null
  selling_price_unit: number | null
  unit_price: number | null
  discount_type: 'percent' | 'fixed' | null
  discount_value: number | null
  discount_amount: number | null
  tax_category: string
  tax_rate_snapshot: number | null
  line_cost_total: number | null
  line_net_total: number | null
  line_tax_total: number | null
  line_gross_total: number | null
  procurement_fee_eligible: boolean
  selected_finish: string | null
  selected_fabric: string | null
  selected_size: string | null
  notes: string | null
  internal_notes: string | null
  section: string | null
  spec_details: string | null
  image_url: string | null
  product: { images: string[] | null } | null
  sort_order: number
  fba_sku: string | null
  supplier_sku: string | null
}

export interface IssuedDoc {
  id: string
  doc_type: 'quote' | 'proforma' | 'invoice' | 'service_invoice'
  document_number: string
  revision: number
  issued_at: string
}

export interface DocTotals {
  productCostSubtotal?: number | null
  productSellingSubtotal?: number
  serviceSubtotal?: number
  otherChargesSubtotal?: number
  discountTotal?: number
  procurementFeeBasisAmount?: number
  procurementFee?: number
  netSubtotal?: number
  vatByCategory?: Record<string, number>
  vatTotal?: number
  grossTotal?: number
  depositRequested?: number
  paymentsReceived?: number
  balanceDue?: number
  effectiveMarkupPercent?: number | null
  effectiveMarginPercent?: number | null
  costIncomplete?: boolean
  approvalReasons?: string[]
}

export interface CommercialDoc {
  id: string
  proforma_number: string
  quote_number: string | null
  revision_number: number
  document_status: 'draft' | 'pending_approval' | 'approved' | 'issued' | 'cancelled'
  approval_status: 'none' | 'required_commercial' | 'required_ultra' | 'approved' | 'blocked'
  approval_reason: string | null
  approved_at: string | null
  issued_at: string | null
  locked_at: string | null
  stage: string
  lost_reason: string | null
  client_name: string | null
  client_email: string | null
  client_company: string | null
  billing_address: string | null
  delivery_address: string | null
  project_name: string | null
  project_location: string | null
  currency: string
  quote_date: string | null
  valid_until: string | null
  pricing_method: 'markup' | 'margin'
  default_tax_category: string
  vat_rate: number
  deposit_percent: number
  deposit_basis: 'gross_total' | 'net_subtotal'
  payments_received: number
  procurement_fee_type: string | null
  procurement_fee_basis: string | null
  procurement_fee_value: number | null
  procurement_fee_manual_base: number | null
  procurement_fee_override: number | null
  procurement_fee_override_reason: string | null
  lead_time: string | null
  delivery_notes: string | null
  payment_terms: string | null
  notes: string | null
  admin_notes: string | null
  invoice_number: string | null
  invoice_date: string | null
  invoice_due_date: string | null
  quote_request_id: string | null
  contact_user_id: string | null
  totals: DocTotals | null
  items: LineItem[]
  downloads: Array<{ id: string; doc_type: string; audience: string; manufacturer_id: string | null; manufacturer_name: string | null; downloaded_at: string; manufacturer: Manu }>
  issued: IssuedDoc[]
  contact: { id: string; first_name: string | null; last_name: string | null; email: string; role: string } | null
}

export interface DocPermissions {
  canEdit: boolean
  canPriceEdit: boolean
  canDiscountOverride: boolean
  canApprove: boolean
  canIssueInvoice: boolean
  isUltraAdmin: boolean
}

// ── Small editable inputs (blur/Enter to save) ──

export function Field({ label, value, onSave, placeholder, disabled, width }: {
  label: string; value: string | null; onSave: (v: string) => void
  placeholder?: string; disabled?: boolean; width?: number | string
}) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => { setV(value ?? '') }, [value])
  return (
    <div style={width ? { width } : undefined}>
      <div className="form-label">{label}</div>
      <input
        style={{ ...inp, opacity: disabled ? 0.6 : 1 }}
        value={v} placeholder={placeholder} disabled={disabled}
        onChange={e => setV(e.target.value)}
        onBlur={() => { if (v !== (value ?? '')) onSave(v) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </div>
  )
}

export function Area({ label, value, onSave, placeholder, disabled }: {
  label: string; value: string | null; onSave: (v: string) => void
  placeholder?: string; disabled?: boolean
}) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => { setV(value ?? '') }, [value])
  return (
    <div>
      <div className="form-label">{label}</div>
      <textarea
        style={{ ...inp, minHeight: 72, resize: 'vertical', fontFamily: 'inherit', opacity: disabled ? 0.6 : 1 }}
        value={v} placeholder={placeholder} disabled={disabled}
        onChange={e => setV(e.target.value)} onBlur={() => { if (v !== (value ?? '')) onSave(v) }}
      />
    </div>
  )
}

export const TAX_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'reduced', label: 'Reduced' },
  { value: 'zero', label: 'Zero-rated' },
  { value: 'exempt', label: 'Exempt' },
  { value: 'outside_scope', label: 'Outside scope' },
]
