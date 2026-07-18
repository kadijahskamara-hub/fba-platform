// ============================================================
// FBA Platform — Shared TypeScript Types
// (Sprint 1: lifecycle, documents, variants, finishes, imports)
// ============================================================

// ── User & Auth ──────────────────────────────────────────────

export type UserRole =
  | 'guest'
  | 'retail_customer'
  | 'trade_applicant'
  | 'trade_user'
  | 'admin'
  | 'staff'

export type UserStatus =
  | 'active' | 'pending' | 'approved' | 'declined' | 'revoked' | 'suspended' | 'archived'
  // Sprint 7: permanent (anonymised) deletion — terminal state, Ultra Admin only.
  | 'deleted'

export interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  role: UserRole
  status: UserStatus
  avatarUrl?: string
  createdAt: string
  updatedAt: string
}

export interface SessionUser {
  id: string
  email: string
  role: UserRole
  firstName: string
  lastName: string
}

// ── Trade Applications ───────────────────────────────────────

export type ApplicationStatus =
  | 'pending' | 'form_sent' | 'under_review' | 'approved' | 'declined' | 'revoked'

export interface TradeApplication {
  id: string
  userId: string
  companyName: string
  businessType: string
  website?: string
  location?: string
  projectType?: string
  estimatedBudget?: string
  howDidYouHear?: string
  vatNumber?: string
  companyRegistration?: string
  tradeReferences?: string
  portfolioUrl?: string
  annualSpendEstimate?: string
  status: ApplicationStatus
  adminNotes?: string
  detailedFormSentAt?: string
  reviewedAt?: string
  reviewedBy?: string
  createdAt: string
  updatedAt: string
  // joined
  user?: User
}

// ── Categories ───────────────────────────────────────────────

export interface Category {
  id: string
  name: string
  slug: string
  description?: string
  sortOrder: number
  subcategories?: Subcategory[]
}

export interface Subcategory {
  id: string
  categoryId: string
  name: string
  slug: string
  sortOrder: number
}

// ── Artisans ─────────────────────────────────────────────────

export interface Artisan {
  id: string
  name: string
  slug: string
  location?: string
  countryCode?: string
  bio: string
  craftCategory?: string
  heroImage?: string
  galleryImages: string[]
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

// ── Products ─────────────────────────────────────────────────

export type ProductVisibility = 'draft' | 'published' | 'hidden'
export type ProductAudience   = 'retail' | 'trade' | 'retail_and_trade'
export type PriceType         = 'fixed' | 'price_on_request'
export type CurrencyCode      = 'GBP' | 'EUR' | 'USD'

// Derived lifecycle status. `visibility` stays the stored enum;
// archived/deleted are timestamp-driven ("hidden" == unpublished).
export type ProductStatus = 'draft' | 'published' | 'unpublished' | 'archived' | 'deleted'

export function deriveProductStatus(p: {
  visibility: ProductVisibility
  archivedAt?: string | null
  deletedAt?: string | null
}): ProductStatus {
  if (p.deletedAt) return 'deleted'
  if (p.archivedAt) return 'archived'
  if (p.visibility === 'hidden') return 'unpublished'
  return p.visibility // 'draft' | 'published'
}

export type ImportSourceType =
  | 'google_drive' | 'google_sheet' | 'csv' | 'manual' | 'brand_integration' | 'other'

export interface Product {
  id: string
  name: string
  slug: string
  sku?: string
  referenceCode?: string
  categoryId?: string
  subcategoryId?: string
  artisanId?: string
  description: string
  shortDescription?: string
  retailPrice?: number
  tradePrice?: number
  supplierCost?: number
  priceType: PriceType
  currency: CurrencyCode
  visibility: ProductVisibility
  audience: ProductAudience
  isFbaCollection: boolean
  leadTime?: string
  leadTimeWeeks?: number
  shippingOrigin?: string
  shippingNotes?: string
  images: string[]
  seoTitle?: string
  seoDescription?: string
  // Technical Passport
  fireRetardant?: boolean
  stainProofed?: boolean
  rubCount40k?: boolean
  // Edit catalogue filters
  finishType?: string
  originRegion?: string
  // Lifecycle (Sprint 1)
  archivedAt?: string | null
  archivedBy?: string | null
  deletedAt?: string | null
  deletedBy?: string | null
  deleteReason?: string | null
  lastUpdatedBy?: string | null
  // Content fields (site brief §8–9)
  technicalDescription?: string | null
  customisationNote?: string | null
  madeToOrder?: boolean
  dispatchTimeLabel?: string | null
  leadTimeMinWeeks?: number | null
  leadTimeMaxWeeks?: number | null
  minOrderQuantity?: number | null
  publicBrandVisible?: boolean
  // Import source metadata
  sourceType?: ImportSourceType
  sourceUrl?: string | null
  sourceFileId?: string | null
  sourceSheetId?: string | null
  sourceRowId?: string | null
  sourceBatchId?: string | null
  sourceHash?: string | null
  lastImportedAt?: string | null
  lastImportMode?: string | null
  createdAt: string
  updatedAt: string
  // joined
  category?: Category
  subcategory?: Subcategory
  artisan?: Artisan
  specifications?: ProductSpecification
}

// ── Site Settings ─────────────────────────────────────────────

export interface HeroImageSetting {
  url: string
  alt: string
}

export interface ProductSpecification {
  id: string
  productId: string
  dimensionsSummary?: string
  widthMm?: number
  depthMm?: number
  heightMm?: number
  seatHeightMm?: number
  diameterMm?: number
  weightKg?: number
  material?: string
  finish?: string
  fabric?: string
  comAvailable: boolean
  careInstructions?: string
  technicalNotes?: string
  bulbType?: string
  wattage?: string
  voltage?: string
  plugType?: string
  cableLength?: string
  dimmable?: boolean
  ipRating?: string
}

// ── Product documents / variants / finishes (Sprint 1) ──────

export type ProductDocumentType =
  | 'product_specification' | 'upholstery_program' | 'material_finishes'
  | 'tear_sheet' | 'technical_passport' | 'care_maintenance'
  | 'installation_guide' | 'warranty'

export interface ProductDocument {
  id: string
  productId: string
  documentType: ProductDocumentType
  label?: string | null
  url: string
  fileName?: string | null
  fileSize?: number | null
  mimeType?: string | null
  sourceUrl?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ProductVariant {
  id: string
  productId: string
  variantName: string
  width?: number | null
  height?: number | null
  depth?: number | null
  diameter?: number | null
  seatHeight?: number | null
  weightKg?: number | null
  unit: string
  priceOverride?: number | null
  tradePriceOverride?: number | null
  leadTimeOverride?: string | null
  availability: 'available' | 'unavailable' | 'made_to_order'
  sortOrder: number
}

export type FinishCategory = 'hard_finish' | 'upholstery'

export interface ProductFinish {
  id: string
  productId: string
  finishCategory: FinishCategory
  finishName: string
  finishCode?: string | null
  material?: string | null
  colour?: string | null
  swatchUrl?: string | null
  comAccepted?: boolean | null
  rubCount?: number | null
  fireTreatment?: string | null
  isDefault: boolean
  availability: 'available' | 'unavailable'
  sortOrder: number
}

// ── Import batches (Sprint 2 data model, created in Sprint 1) ─

export type ImportMode =
  | 'create_only' | 'upsert' | 'force_refresh' | 'replace_batch' | 'purge_reload'

export type ImportBatchStatus =
  | 'pending' | 'previewed' | 'running' | 'completed'
  | 'completed_with_errors' | 'failed' | 'rolled_back' | 'cancelled'

export type ImportItemAction =
  | 'create' | 'update' | 'unchanged' | 'skip' | 'conflict' | 'archive' | 'fail'

export interface ImportBatch {
  id: string
  batchRef: string
  sourceType: ImportSourceType
  sourceUrl?: string | null
  sourceName?: string | null
  importMode: ImportMode
  status: ImportBatchStatus
  productsFound: number
  createdCount: number
  updatedCount: number
  unchangedCount: number
  skippedCount: number
  conflictCount: number
  archivedCount: number
  failedCount: number
  importedBy?: string | null
  startedAt?: string | null
  completedAt?: string | null
  errorSummary?: string | null
  createdAt: string
}

export interface ImportBatchItem {
  id: string
  batchId: string
  productId?: string | null
  sourceRowNumber?: number | null
  sourceRowId?: string | null
  referenceCode?: string | null
  sku?: string | null
  slug?: string | null
  productName?: string | null
  action: ImportItemAction
  status: 'pending' | 'done' | 'error'
  message?: string | null
  warning?: string | null
  error?: string | null
}

// ── Audit logs ───────────────────────────────────────────────

export interface AuditLog {
  id: string
  actorId?: string | null
  actorEmail?: string | null
  action: string
  entityType: string
  entityId?: string | null
  beforeValue?: unknown
  afterValue?: unknown
  createdAt: string
}

export interface ProductOptionGroup {
  id: string
  productId: string
  name: string
  sortOrder: number
  values?: ProductOptionValue[]
}

export interface ProductOptionValue {
  id: string
  optionGroupId: string
  value: string
  priceModifier: number
  sortOrder: number
}

// ── Pricing (role-resolved) ──────────────────────────────────

export type PriceDisplay =
  | { type: 'fixed';   amount: number; currency: CurrencyCode; label: string }
  | { type: 'request'; label: string }

// ── Projects ─────────────────────────────────────────────────

export interface Project {
  id: string
  userId: string
  name: string
  location?: string
  budget?: number
  currency: CurrencyCode
  notes?: string
  createdAt: string
  updatedAt: string
  items?: ProjectItem[]
}

export interface ProjectItem {
  id: string
  projectId: string
  productId: string
  quantity: number
  notes?: string
  createdAt: string
  product?: Product
}

// ── Cart ─────────────────────────────────────────────────────

export interface CartItem {
  id: string
  userId: string
  productId: string
  quantity: number
  product?: Product
}

// ── Retail Orders ────────────────────────────────────────────

export type OrderStatus =
  | 'pending' | 'paid' | 'processing' | 'shipped' | 'completed' | 'cancelled' | 'refunded'

export interface RetailOrder {
  id: string
  userId?: string
  orderNumber: string
  status: OrderStatus
  totalAmount: number
  currency: CurrencyCode
  shippingName?: string
  shippingAddr?: string
  notes?: string
  createdAt: string
  updatedAt: string
  items?: RetailOrderItem[]
}

export interface RetailOrderItem {
  id: string
  orderId: string
  productId?: string
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

// ── Quote Requests ───────────────────────────────────────────

export type QuoteStatus =
  | 'new' | 'reviewing' | 'quoted' | 'accepted' | 'rejected' | 'converted_to_order'

export interface QuoteRequest {
  id: string
  userId?: string
  projectId?: string
  projectName?: string
  projectLocation?: string
  budget?: number
  requiredBy?: string
  status: QuoteStatus
  notes?: string
  adminNotes?: string
  createdAt: string
  updatedAt: string
  items?: QuoteRequestItem[]
}

export interface QuoteRequestItem {
  id: string
  quoteRequestId: string
  productId?: string
  productName: string
  quantity: number
  notes?: string
}

// ── Contacts ─────────────────────────────────────────────────

export type ContactType = 'retail' | 'trade' | 'procurement' | 'atelier' | 'newsletter' | 'general'

export interface Contact {
  id: string
  firstName?: string
  lastName?: string
  email: string
  phone?: string
  companyName?: string
  contactType: ContactType
  source: string
  consentMarketing: boolean
  notes?: string
  createdAt: string
}

// ── Service Enquiries ────────────────────────────────────────

export interface ServiceEnquiry {
  id: string
  name: string
  email: string
  phone?: string
  companyName?: string
  enquiryTypes: string[]
  projectName?: string
  projectLocation?: string
  budgetRange?: string
  timeline?: string
  message?: string
  createdAt: string
}

// ── Journal ──────────────────────────────────────────────────

export type JournalStatus = 'draft' | 'published'

export interface JournalPost {
  id: string
  title: string
  slug: string
  excerpt?: string
  content: string
  featuredImage?: string
  category?: string
  tags: string[]
  seoTitle?: string
  seoDescription?: string
  status: JournalStatus
  authorId?: string
  publishedAt?: string
  createdAt: string
  updatedAt: string
}

// ── Staff Permissions ────────────────────────────────────────

export interface StaffRow {
  id: string
  first_name: string
  last_name: string
  email: string
  role: 'admin' | 'staff'
  status: string
  created_at: string
  /** Sprint 7.1: surfaced so the staff screen can show the Ultra Admin badge. */
  is_ultra_admin?: boolean
  staff_permissions: { permissions: StaffPermission[] }[] | null
}

export type StaffPermission =
  | 'dashboard' | 'trade_applications' | 'products' | 'artisans'
  | 'retail_orders' | 'commercial_orders' | 'quote_pipeline'
  | 'journals' | 'settings' | 'users' | 'contacts'
  // Granular commercial permissions (Sprint 1). 'quote_pipeline' is the
  // legacy broad key and maps to view/create/edit for compatibility.
  // 'ultra_admin' and 'commercial_settings_manage' are NOT grantable via
  // the staff permissions array — they flow only from users.is_ultra_admin.
  | 'quote_pipeline_view' | 'quote_create' | 'quote_edit'
  | 'quote_price_edit' | 'quote_discount_override' | 'quote_approve'
  | 'commercial_settings_view' | 'invoice_create' | 'invoice_issue'
  | 'payment_view' | 'purchase_order_prepare' | 'purchase_order_approve'
  // Sprint 4 — delivery & logistics
  | 'delivery_view' | 'delivery_create' | 'delivery_dispatch'
  | 'delivery_confirm' | 'pod_record' | 'installation_manage'
  // Sprint 5 — documents & prepared communications. 'template_manage'
  // is NOT grantable here (Ultra-by-default, like commercial_settings_manage).
  | 'document_generate' | 'document_verify'
  | 'communication_prepare' | 'communication_mark_sent'
  // Sprint 6 — accounting controls. 'refund_approve' and 'period_manage'
  // are NOT grantable here (Ultra-by-default, segregation of duties).
  | 'accounting_view' | 'accounting_export' | 'reconciliation_manage'
  | 'refund_record' | 'invoice_void'
  // Sprint 18 (QA P0) — segregated finance controls that permissions.ts
  // has always honoured for staff but the Staff & Permissions screen
  // never offered: Ultra Admin holds them implicitly; they are
  // explicitly grantable to trusted staff.
  | 'invoice_view' | 'invoice_approve'
  | 'payment_record' | 'payment_confirm' | 'payment_allocate' | 'payment_reverse'
  | 'credit_note_create' | 'credit_note_approve'

export interface StaffPermissions {
  id: string
  userId: string
  permissions: StaffPermission[]
}

// ── Admin Dashboard Metrics ──────────────────────────────────

export interface DashboardMetrics {
  totalTradeApplications: number
  pendingApplications: number
  approvedTradeUsers: number
  declinedRevoked: number
  openQuotes: number
  quotePipelineValue: number
  retailOrdersThisMonth: number
  recentApplications: TradeApplication[]
  topViewedProducts: Array<{ product: Product; views: number }>
  topSavedProducts: Array<{ product: Product; saves: number }>
}
