"use strict";
// ============================================================
// Commercial domain — shared types.
// Pure types only: importable from client components, server
// code, and tests alike.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_APPROVAL_THRESHOLDS = exports.COMMUNICATION_PACK_STATUSES = exports.COMMUNICATION_PACK_TYPES = exports.DOCUMENT_AUDIENCES = exports.DOCUMENT_FILE_ENTITY_TYPES = exports.COMMERCIAL_PERMISSIONS = exports.LINE_TYPES = exports.TAX_CATEGORIES = void 0;
exports.TAX_CATEGORIES = ['standard', 'reduced', 'zero', 'exempt', 'outside_scope'];
exports.LINE_TYPES = ['product', 'service', 'fee', 'delivery', 'installation', 'adjustment'];
exports.COMMERCIAL_PERMISSIONS = [
    'quote_pipeline_view', 'quote_create', 'quote_edit', 'quote_price_edit',
    'quote_discount_override', 'quote_approve', 'commercial_settings_view',
    'commercial_settings_manage', 'invoice_view', 'invoice_create', 'invoice_approve',
    'invoice_issue', 'payment_view', 'payment_record', 'payment_confirm',
    'payment_allocate', 'payment_reverse', 'credit_note_create', 'credit_note_approve',
    'purchase_order_prepare', 'purchase_order_approve',
    'delivery_view', 'delivery_create', 'delivery_dispatch', 'delivery_confirm',
    'pod_record', 'installation_manage',
    'document_generate', 'document_verify', 'communication_prepare',
    'communication_mark_sent', 'template_manage', 'ultra_admin',
];
exports.DOCUMENT_FILE_ENTITY_TYPES = [
    'issued_document', 'sales_invoice', 'credit_note',
    'payment_receipt', 'purchase_order', 'delivery_note', 'statement',
];
exports.DOCUMENT_AUDIENCES = ['client', 'site', 'manufacturer'];
exports.COMMUNICATION_PACK_TYPES = ['client', 'manufacturer', 'delivery_recipient'];
exports.COMMUNICATION_PACK_STATUSES = [
    'prepared', 'downloaded', 'marked_sent', 'needs_attention', 'superseded',
];
exports.DEFAULT_APPROVAL_THRESHOLDS = {
    margin_commercial_below: 30,
    margin_ultra_below: 20,
    discount_commercial_above: 10,
    discount_ultra_above: 20,
    negative_margin: 'blocked_ultra_approval',
};
