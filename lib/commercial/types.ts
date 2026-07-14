// ============================================================
// Commercial domain — shared types.
// Pure types only: importable from client components, server
// code, and tests alike.
// ============================================================

export type PricingMethod = 'markup' | 'margin'
export type LinePricingMethod = 'markup' | 'margin' | 'manual'
export type TaxCategory = 'standard' | 'reduced' | 'zero' | 'exempt' | 'outside_scope'
export type LineType = 'product' | 'service' | 'fee' | 'delivery' | 'installation' | 'adjustment'
export type DiscountType = 'percent' | 'fixed'
export type DocumentStatus = 'draft' | 'pending_approval' | 'approved' | 'issued' | 'cancelled'
export type ApprovalLevel = 'none' | 'commercial' | 'ultra' | 'blocked'
export type ApprovalStatus = 'none' | 'required_commercial' | 'required_ultra' | 'approved' | 'blocked'
export type IssuedDocType = 'quote' | 'proforma' | 'invoice' | 'service_invoice'
export type ProcurementFeeType = 'percentage' | 'fixed' | 'tiered' | 'none'
export type ProcurementFeeBasis =
  | 'product_selling_subtotal'
  | 'product_cost_subtotal'
  | 'approved_procurement_value'
  | 'selected_lines'
  | 'manual_base_amount'
export type DepositBasis = 'gross_total' | 'net_subtotal'
export type SupplierCostSource = 'manual' | 'catalogue_trade' | 'catalogue_supplier' | 'unavailable'

export const TAX_CATEGORIES: TaxCategory[] = ['standard', 'reduced', 'zero', 'exempt', 'outside_scope']
export const LINE_TYPES: LineType[] = ['product', 'service', 'fee', 'delivery', 'installation', 'adjustment']

// ── Commercial permissions ───────────────────────────────────

export type CommercialPermission =
  | 'quote_pipeline_view'
  | 'quote_create'
  | 'quote_edit'
  | 'quote_price_edit'
  | 'quote_discount_override'
  | 'quote_approve'
  | 'commercial_settings_view'
  | 'commercial_settings_manage'
  | 'invoice_view'
  | 'invoice_create'
  | 'invoice_approve'
  | 'invoice_issue'
  | 'payment_view'
  | 'payment_record'
  | 'payment_confirm'
  | 'payment_allocate'
  | 'payment_reverse'
  | 'credit_note_create'
  | 'credit_note_approve'
  | 'purchase_order_prepare'
  | 'purchase_order_approve'
  | 'delivery_view'
  | 'delivery_create'
  | 'delivery_dispatch'
  | 'delivery_confirm'
  | 'pod_record'
  | 'installation_manage'
  // Sprint 5 — documents & prepared communications
  | 'document_generate'
  | 'document_verify'
  | 'communication_prepare'
  | 'communication_mark_sent'
  | 'template_manage'
  // Sprint 6 — accounting controls
  | 'accounting_view'
  | 'accounting_export'
  | 'reconciliation_manage'
  | 'refund_record'
  | 'refund_approve'
  | 'period_manage'
  | 'invoice_void'
  | 'ultra_admin'

export const COMMERCIAL_PERMISSIONS: CommercialPermission[] = [
  'quote_pipeline_view', 'quote_create', 'quote_edit', 'quote_price_edit',
  'quote_discount_override', 'quote_approve', 'commercial_settings_view',
  'commercial_settings_manage', 'invoice_view', 'invoice_create', 'invoice_approve',
  'invoice_issue', 'payment_view', 'payment_record', 'payment_confirm',
  'payment_allocate', 'payment_reverse', 'credit_note_create', 'credit_note_approve',
  'purchase_order_prepare', 'purchase_order_approve',
  'delivery_view', 'delivery_create', 'delivery_dispatch', 'delivery_confirm',
  'pod_record', 'installation_manage',
  'document_generate', 'document_verify', 'communication_prepare',
  'communication_mark_sent', 'template_manage',
  'accounting_view', 'accounting_export', 'reconciliation_manage',
  'refund_record', 'refund_approve', 'period_manage', 'invoice_void',
  'ultra_admin',
]

// ── Sprint 5 — documents & communications enums ──────────────

export type DocumentFileEntityType =
  | 'issued_document' | 'sales_invoice' | 'credit_note'
  | 'payment_receipt' | 'purchase_order' | 'delivery_note' | 'statement'
export type DocumentAudience = 'client' | 'site' | 'manufacturer'
export type CommunicationPackType = 'client' | 'manufacturer' | 'delivery_recipient'
export type CommunicationPackStatus =
  | 'prepared' | 'downloaded' | 'marked_sent' | 'needs_attention' | 'superseded'
export type CommunicationEvent =
  | 'prepared' | 'edited' | 'downloaded' | 'marked_sent'
  | 'needs_attention' | 're_prepared' | 'superseded'

export const DOCUMENT_FILE_ENTITY_TYPES: DocumentFileEntityType[] = [
  'issued_document', 'sales_invoice', 'credit_note',
  'payment_receipt', 'purchase_order', 'delivery_note', 'statement',
]
export const DOCUMENT_AUDIENCES: DocumentAudience[] = ['client', 'site', 'manufacturer']
export const COMMUNICATION_PACK_TYPES: CommunicationPackType[] = ['client', 'manufacturer', 'delivery_recipient']
export const COMMUNICATION_PACK_STATUSES: CommunicationPackStatus[] = [
  'prepared', 'downloaded', 'marked_sent', 'needs_attention', 'superseded',
]

// ── Approval thresholds (stored in commercial_settings) ──────

export interface ApprovalThresholds {
  margin_commercial_below: number   // % — margin below this needs Commercial Admin
  margin_ultra_below: number        // % — margin below this needs Ultra Admin
  discount_commercial_above: number // % — discount above this needs Commercial Admin
  discount_ultra_above: number      // % — discount above this needs Ultra Admin
  negative_margin: 'blocked_ultra_approval'
}

export const DEFAULT_APPROVAL_THRESHOLDS: ApprovalThresholds = {
  margin_commercial_below: 30,
  margin_ultra_below: 20,
  discount_commercial_above: 10,
  discount_ultra_above: 20,
  negative_margin: 'blocked_ultra_approval',
}

// ── Commercial settings row ──────────────────────────────────

export interface CommercialSettings {
  id: string
  pricing_method_default: PricingMethod
  vat_registered: boolean
  vat_number: string | null
  default_vat_rate: number
  default_tax_category: TaxCategory
  default_deposit_percent: number
  deposit_value_rules: Array<{ min_order_value: number; deposit_percent: number }>
  default_quote_expiry_days: number
  default_currency: string
  default_payment_terms: string | null
  default_lead_time: string | null
  procurement_fee_type: ProcurementFeeType
  procurement_fee_basis: ProcurementFeeBasis
  procurement_fee_value: number
  procurement_fee_tiers: Array<{ up_to: number | null; value: number }>
  approval_thresholds: ApprovalThresholds
  company_legal_name: string
  company_registration_number: string | null
  registered_address: string | null
  invoice_email: string
  invoice_phone: string | null
  bank_name: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  bank_sort_code: string | null
  // Sprint 2 — procurement thresholds
  po_value_approval_threshold: number | null
  po_freight_approval_threshold: number | null
  default_acknowledgement_days: number
  // Sprint 3 — client invoicing / payments
  default_deposit_basis: DepositBasis
  default_payment_terms_days: number
  payment_backdate_approval_days: number
  // Sprint 4 — delivery & logistics
  delivery_confirmation_expiry_days: number
  updated_at: string
  updated_by: string | null
}

// ── Calculation engine I/O ───────────────────────────────────

export interface CalcLineInput {
  id?: string
  lineType: LineType
  quantity: number
  /** Supplier / internal cost per unit in major currency units, or null when unavailable. */
  supplierCostUnit: number | null
  pricingMethod: LinePricingMethod
  /** Markup or margin %, per pricingMethod. Ignored for 'manual'. */
  pricingPercent: number | null
  /** Manual selling price per unit (major units). Required for 'manual'. */
  sellingPriceUnit: number | null
  discountType: DiscountType | null
  discountValue: number | null
  taxCategory: TaxCategory
  procurementFeeEligible: boolean
  /** Explicitly selected for the 'selected_lines' procurement-fee basis. */
  procurementFeeSelected?: boolean
}

export interface ProcurementFeeConfig {
  type: ProcurementFeeType
  basis: ProcurementFeeBasis
  value: number
  tiers?: Array<{ up_to: number | null; value: number }>
  manualBase?: number | null
  /** Authorised manual override of the calculated fee (major units). */
  override?: number | null
}

export interface CalcDocInput {
  lines: CalcLineInput[]
  vatRegistered: boolean
  /** Percentage rates for the rated categories; zero/exempt/outside_scope are always 0. */
  taxRates: { standard: number; reduced: number }
  depositPercent: number
  depositBasis: DepositBasis
  procurementFee: ProcurementFeeConfig
  paymentsReceived: number
  creditTotal?: number
  thresholds: ApprovalThresholds
  /** True when any supplier cost was manually overridden (approval trigger). */
  supplierCostOverridden?: boolean
  /** True when an exchange rate was manually overridden (approval trigger). */
  exchangeRateOverridden?: boolean
}

export interface CalcLineResult {
  id?: string
  lineType: LineType
  quantity: number
  supplierCostUnit: number | null
  sellingPriceUnit: number
  /** Line totals in major units, rounded to 2dp. */
  lineCostTotal: number | null
  lineNetBeforeDiscount: number
  discountAmount: number
  discountPercentEffective: number
  lineNetTotal: number
  taxCategory: TaxCategory
  taxRate: number
  lineTaxTotal: number
  lineGrossTotal: number
  /** Margin % on this line, or null when cost is unavailable. */
  marginPercent: number | null
  markupPercent: number | null
  flags: {
    zeroCost: boolean
    invalidPricing: boolean
    negativeMargin: boolean
    costUnavailable: boolean
  }
}

export interface ApprovalRequirement {
  level: ApprovalLevel
  reasons: string[]
}

export interface CalcDocResult {
  lines: CalcLineResult[]
  productCostSubtotal: number | null   // null when any product cost is unavailable
  productSellingSubtotal: number
  serviceSubtotal: number
  otherChargesSubtotal: number
  discountTotal: number
  procurementFeeBasisAmount: number
  procurementFee: number
  procurementFeeOverridden: boolean
  netSubtotal: number
  vatByCategory: Partial<Record<TaxCategory, number>>
  vatTotal: number
  grossTotal: number
  depositRequested: number
  paymentsReceived: number
  creditTotal: number
  balanceDue: number
  effectiveMarkupPercent: number | null
  effectiveMarginPercent: number | null
  costIncomplete: boolean
  approval: ApprovalRequirement
}

/** Client-supplied totals to cross-check (anti-tampering). */
export interface ClientTotalsClaim {
  netSubtotal?: number
  vatTotal?: number
  grossTotal?: number
}
