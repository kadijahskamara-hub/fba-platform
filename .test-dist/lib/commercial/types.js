"use strict";
// ============================================================
// Commercial domain — shared types.
// Pure types only: importable from client components, server
// code, and tests alike.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_APPROVAL_THRESHOLDS = exports.COMMERCIAL_PERMISSIONS = exports.LINE_TYPES = exports.TAX_CATEGORIES = void 0;
exports.TAX_CATEGORIES = ['standard', 'reduced', 'zero', 'exempt', 'outside_scope'];
exports.LINE_TYPES = ['product', 'service', 'fee', 'delivery', 'installation', 'adjustment'];
exports.COMMERCIAL_PERMISSIONS = [
    'quote_pipeline_view', 'quote_create', 'quote_edit', 'quote_price_edit',
    'quote_discount_override', 'quote_approve', 'commercial_settings_view',
    'commercial_settings_manage', 'invoice_create', 'invoice_issue',
    'payment_view', 'purchase_order_prepare', 'purchase_order_approve', 'ultra_admin',
];
exports.DEFAULT_APPROVAL_THRESHOLDS = {
    margin_commercial_below: 30,
    margin_ultra_below: 20,
    discount_commercial_above: 10,
    discount_ultra_above: 20,
    negative_margin: 'blocked_ultra_approval',
};
