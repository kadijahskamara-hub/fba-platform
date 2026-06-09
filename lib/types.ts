// ============================================================
// FBA Platform — Shared TypeScript Types
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
  staff_permissions: { permissions: StaffPermission[] }[] | null
}

export type StaffPermission =
  | 'dashboard' | 'trade_applications' | 'products' | 'artisans'
  | 'retail_orders' | 'commercial_orders' | 'quote_pipeline'
  | 'journals' | 'settings' | 'users' | 'contacts'

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
