// ============================================================
// Staff permission grouping (Sprint 25).
//
// Single source of truth for permission LABELS, their GROUPS and
// role PRESETS — used by the Staff & Permissions editor, the
// read-only permission views and the archived-staff viewer.
// Pure module: no imports beyond types, fully unit-tested
// (every StaffPermission must appear in exactly one group).
// ============================================================

import type { StaffPermission } from './types'

export const PERMISSION_LABELS: Record<StaffPermission, string> = {
  dashboard:           'Dashboard',
  trade_applications:  'Trade Applications',
  products:            'Products',
  artisans:            'Artisans',
  retail_orders:       'Retail Orders',
  commercial_orders:   'Commercial Orders',
  quote_pipeline:      'Quote Pipeline (legacy: view/create/edit)',
  journals:            'Journals',
  settings:            'Settings',
  users:               'Users',
  contacts:            'Contacts',
  quote_pipeline_view:     'Quotes — view pipeline',
  quote_create:            'Quotes — create',
  quote_edit:              'Quotes — edit lines & details',
  quote_price_edit:        'Quotes — edit costs & pricing',
  quote_discount_override: 'Quotes — apply discounts',
  quote_approve:           'Quotes — approve (Commercial Admin)',
  commercial_settings_view: 'Commercial settings — view',
  invoice_view:            'Invoices — view',
  invoice_create:          'Invoices — create',
  invoice_approve:         'Invoices — approve (segregated)',
  invoice_issue:           'Invoices — issue',
  payment_view:            'Payments — view',
  payment_record:          'Payments — record',
  payment_confirm:         'Payments — confirm (segregated)',
  payment_allocate:        'Payments — allocate to invoices',
  payment_reverse:         'Payments — reverse (segregated)',
  credit_note_create:      'Credit notes — create drafts & void',
  credit_note_approve:     'Credit notes — approve & issue (segregated)',
  purchase_order_prepare:  'Purchase orders — prepare (future)',
  purchase_order_approve:  'Purchase orders — approve (future)',
  delivery_view:           'Deliveries — view',
  delivery_create:         'Deliveries — create & edit',
  delivery_dispatch:       'Deliveries — dispatch (issues delivery note)',
  delivery_confirm:        'Deliveries — confirmation links & exceptions',
  pod_record:              'Deliveries — record proof of delivery',
  installation_manage:     'Installations — manage & sign off',
  document_generate:       'Documents — generate & regenerate PDFs',
  document_verify:         'Documents — verify stored file checksums',
  communication_prepare:   'Communications — prepare & edit packs',
  communication_mark_sent: 'Communications — mark packs as sent',
  accounting_view:         'Accounting — view periods, exports & reports',
  accounting_export:       'Accounting — run financial exports',
  reconciliation_manage:   'Accounting — mark reconciled / excluded',
  refund_record:           'Refunds — record (approval is Ultra-only)',
  invoice_void:            'Invoices — void (blocked by locked periods)',
}

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as StaffPermission[]

export type PermissionGroup = { key: string; label: string; permissions: StaffPermission[] }

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'general', label: 'General',
    permissions: ['dashboard', 'settings', 'users', 'contacts', 'trade_applications'],
  },
  {
    key: 'catalogue', label: 'Catalogue & Content',
    permissions: ['products', 'artisans', 'journals'],
  },
  {
    key: 'quotes', label: 'Quotes',
    permissions: [
      'quote_pipeline', 'quote_pipeline_view', 'quote_create', 'quote_edit',
      'quote_price_edit', 'quote_discount_override', 'quote_approve', 'commercial_settings_view',
    ],
  },
  {
    key: 'orders', label: 'Orders',
    permissions: ['retail_orders', 'commercial_orders'],
  },
  {
    key: 'invoicing', label: 'Invoicing & Payments',
    permissions: [
      'invoice_view', 'invoice_create', 'invoice_approve', 'invoice_issue', 'invoice_void',
      'payment_view', 'payment_record', 'payment_confirm', 'payment_allocate', 'payment_reverse',
    ],
  },
  {
    key: 'credit', label: 'Credit & Refunds',
    permissions: ['credit_note_create', 'credit_note_approve', 'refund_record'],
  },
  {
    key: 'logistics', label: 'Procurement & Logistics',
    permissions: [
      'purchase_order_prepare', 'purchase_order_approve',
      'delivery_view', 'delivery_create', 'delivery_dispatch', 'delivery_confirm',
      'pod_record', 'installation_manage',
    ],
  },
  {
    key: 'documents', label: 'Documents & Communications',
    permissions: ['document_generate', 'document_verify', 'communication_prepare', 'communication_mark_sent'],
  },
  {
    key: 'accounting', label: 'Accounting',
    permissions: ['accounting_view', 'accounting_export', 'reconciliation_manage'],
  },
]

// Group check state for tri-state "select all" checkboxes.
export function groupState(group: PermissionGroup, granted: StaffPermission[]): 'none' | 'some' | 'all' {
  const count = group.permissions.filter(p => granted.includes(p)).length
  if (count === 0) return 'none'
  if (count === group.permissions.length) return 'all'
  return 'some'
}

// Toggle a whole group: 'all' → remove every group permission,
// anything else → grant every group permission. Order-preserving,
// never touches permissions outside the group.
export function toggleGroup(group: PermissionGroup, granted: StaffPermission[]): StaffPermission[] {
  if (groupState(group, granted) === 'all') {
    return granted.filter(p => !group.permissions.includes(p))
  }
  const set = new Set(granted)
  for (const p of group.permissions) set.add(p)
  return ALL_PERMISSIONS.filter(p => set.has(p))
}

// ---------- Role presets ----------
// One-click starting bundles; always reviewed/tweaked by the admin.
// Segregated approval permissions are deliberately NOT in any preset
// (segregation of duties — grant those individually, eyes open).
export type PermissionPreset = { key: string; label: string; description: string; permissions: StaffPermission[] }

export const PERMISSION_PRESETS: PermissionPreset[] = [
  {
    key: 'operations', label: 'Operations',
    description: 'Orders, deliveries, installations, POs and comms — no pricing or finance approvals.',
    permissions: [
      'dashboard', 'contacts', 'retail_orders', 'commercial_orders',
      'quote_pipeline_view', 'purchase_order_prepare',
      'delivery_view', 'delivery_create', 'delivery_dispatch', 'delivery_confirm',
      'pod_record', 'installation_manage',
      'document_generate', 'communication_prepare', 'communication_mark_sent',
    ],
  },
  {
    key: 'finance', label: 'Finance',
    description: 'Invoicing, payments, credit notes and accounting — approval/confirm powers excluded (segregated).',
    permissions: [
      'dashboard', 'invoice_view', 'invoice_create', 'invoice_issue', 'invoice_void',
      'payment_view', 'payment_record', 'payment_allocate',
      'credit_note_create', 'refund_record',
      'accounting_view', 'accounting_export', 'reconciliation_manage',
    ],
  },
  {
    key: 'content', label: 'Content & Catalogue',
    description: 'Products, artisans, journals, contacts and trade applications.',
    permissions: ['dashboard', 'products', 'artisans', 'journals', 'contacts', 'trade_applications'],
  },
]
