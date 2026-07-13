"use strict";
// ============================================================
// Communications + documents logic tests (Sprint 5).
// Node built-in test runner: npm test
// Covers: template rendering (injection-safe), variable extraction,
// the pack state machine, attachment-scope validation, recipient
// normalisation, and the delivery-note no-price guard applied to a
// delivery-note-shaped snapshot.
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const communications_1 = require("../lib/commercial/communications");
const deliveryLogic_1 = require("../lib/commercial/deliveryLogic");
// ── Template rendering ──────────────────────────────────────
(0, node_test_1.test)('renderTemplate substitutes known variables', () => {
    const r = (0, communications_1.renderTemplate)('Invoice {{document_number}}', 'Dear {{client_name}}, balance {{balance_due}}.', { document_number: 'FBA-INV-2026-0007', client_name: 'Ms Client', balance_due: '£4,200.00' });
    strict_1.default.equal(r.subject, 'Invoice FBA-INV-2026-0007');
    strict_1.default.equal(r.body, 'Dear Ms Client, balance £4,200.00.');
    strict_1.default.deepEqual(r.missing, []);
});
(0, node_test_1.test)('missing variables are reported and rendered blank', () => {
    const r = (0, communications_1.renderTemplate)('Hi {{recipient_name}}', 'Ref {{document_number}} due {{due_date}}', { document_number: 'X' });
    strict_1.default.equal(r.body, 'Ref X due ');
    strict_1.default.deepEqual([...r.missing].sort(), ['due_date', 'recipient_name']);
});
(0, node_test_1.test)('subject whitespace is collapsed and trimmed', () => {
    const r = (0, communications_1.renderTemplate)('  A   {{x}}  ', 'body', { x: 'B' });
    strict_1.default.equal(r.subject, 'A B');
});
(0, node_test_1.test)('a variable value cannot inject a NEW placeholder (single-pass, braces stripped)', () => {
    const r = (0, communications_1.renderTemplateString)('Hello {{name}}', { name: '{{secret}}', secret: 'LEAK' });
    // The injected {{secret}} must NOT be expanded; braces are stripped from the value.
    strict_1.default.equal(r.text, 'Hello secret');
    strict_1.default.ok(!r.text.includes('LEAK'));
});
(0, node_test_1.test)('sanitizeValue strips control chars but keeps tab and newline', () => {
    const v = (0, communications_1.sanitizeValue)('ab\tc\nd');
    strict_1.default.equal(v, 'ab\tc\nd');
});
(0, node_test_1.test)('extractVariables returns unique keys (case-insensitive)', () => {
    strict_1.default.deepEqual((0, communications_1.extractVariables)('{{a}} {{b}} {{a}} {{ c }}').sort(), ['a', 'b', 'c']);
});
// ── Pack state machine ──────────────────────────────────────
(0, node_test_1.test)('prepared can be downloaded, sent, or flagged; not re_prepared', () => {
    strict_1.default.equal((0, communications_1.canApplyEvent)('prepared', 'downloaded'), true);
    strict_1.default.equal((0, communications_1.canApplyEvent)('prepared', 'marked_sent'), true);
    strict_1.default.equal((0, communications_1.canApplyEvent)('prepared', 'needs_attention'), true);
    strict_1.default.equal((0, communications_1.canApplyEvent)('prepared', 're_prepared'), false);
});
(0, node_test_1.test)('superseded packs accept no further events', () => {
    for (const ev of ['downloaded', 'marked_sent', 'needs_attention', 're_prepared', 'edited']) {
        strict_1.default.equal((0, communications_1.canApplyEvent)('superseded', ev), false, `superseded + ${ev}`);
    }
});
(0, node_test_1.test)('needs_attention and marked_sent can be re_prepared', () => {
    strict_1.default.equal((0, communications_1.canApplyEvent)('needs_attention', 're_prepared'), true);
    strict_1.default.equal((0, communications_1.canApplyEvent)('marked_sent', 're_prepared'), true);
});
(0, node_test_1.test)('edits are only allowed while prepared', () => {
    strict_1.default.equal((0, communications_1.canEditPack)('prepared'), true);
    for (const s of communications_1.PACK_STATUSES.filter(x => x !== 'prepared')) {
        strict_1.default.equal((0, communications_1.canEditPack)(s), false, `canEditPack(${s})`);
    }
});
(0, node_test_1.test)('outstanding = prepared | downloaded | needs_attention', () => {
    strict_1.default.equal((0, communications_1.isOutstanding)('prepared'), true);
    strict_1.default.equal((0, communications_1.isOutstanding)('downloaded'), true);
    strict_1.default.equal((0, communications_1.isOutstanding)('needs_attention'), true);
    strict_1.default.equal((0, communications_1.isOutstanding)('marked_sent'), false);
    strict_1.default.equal((0, communications_1.isOutstanding)('superseded'), false);
});
// ── Attachment-scope validation (no cross-order attachments) ─
(0, node_test_1.test)('attachments outside the allowed set are rejected', () => {
    const res = (0, communications_1.validateAttachmentScope)(['a', 'b', 'x'], ['a', 'b', 'c']);
    strict_1.default.equal(res.ok, false);
    strict_1.default.deepEqual(res.invalid, ['x']);
    strict_1.default.deepEqual(res.accepted, ['a', 'b']);
});
(0, node_test_1.test)('a fully in-scope attachment list is accepted', () => {
    const res = (0, communications_1.validateAttachmentScope)(['a', 'c'], ['a', 'b', 'c']);
    strict_1.default.equal(res.ok, true);
    strict_1.default.deepEqual(res.invalid, []);
});
// ── Recipients ──────────────────────────────────────────────
(0, node_test_1.test)('validEmails filters invalid and de-duplicates', () => {
    strict_1.default.deepEqual((0, communications_1.validEmails)(['a@b.com', 'nope', 'a@b.com', '', null, 'c@d.co']), ['a@b.com', 'c@d.co']);
});
(0, node_test_1.test)('normalizeRecipients coerces shape and validates', () => {
    const r = (0, communications_1.normalizeRecipients)({ to: ['a@b.com', 'bad'], cc: ['c@d.com'], names: { 'a@b.com': 'A' } });
    strict_1.default.deepEqual(r.to, ['a@b.com']);
    strict_1.default.deepEqual(r.cc, ['c@d.com']);
    strict_1.default.equal(r.names['a@b.com'], 'A');
});
// ── Delivery-note no-price guard on a delivery-note snapshot ─
(0, node_test_1.test)('a clean delivery-note snapshot has no forbidden fields', () => {
    const snap = {
        docType: 'delivery_note', deliveryNumber: 'FBA-DEL-2026-0001',
        lines: [{ name: 'Oak table', quantity: 1, ordered_quantity: 2, unit_of_measure: 'each' }],
        packages: [{ reference: 'PKG1', weight: '30kg' }],
    };
    strict_1.default.deepEqual((0, deliveryLogic_1.findForbiddenDeliveryFields)(snap), []);
});
(0, node_test_1.test)('an injected price/total field is caught by the guard', () => {
    const snap = {
        docType: 'delivery_note', deliveryNumber: 'FBA-DEL-2026-0002',
        lines: [{ name: 'Oak table', quantity: 1, unit_price: 900, line_gross_total: 1080 }],
    };
    const hits = (0, deliveryLogic_1.findForbiddenDeliveryFields)(snap);
    strict_1.default.ok(hits.some(h => h.includes('unit_price')));
    strict_1.default.ok(hits.some(h => h.includes('line_gross_total')));
});
