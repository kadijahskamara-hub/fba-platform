"use strict";
// ============================================================
// Communications — PURE logic (Sprint 5).
//
// No server-only imports: shared by API routes, the packs server
// module, and the unit tests (see tsconfig.test.json). Contains:
//   • template variable rendering (injection-safe, plain text)
//   • the pack state machine (events + pre-download edit rule)
//   • attachment-scope validation (no cross-order attachments)
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.EDITABLE_PRE_DOWNLOAD = exports.PACK_TYPES = exports.PACK_STATUSES = void 0;
exports.sanitizeValue = sanitizeValue;
exports.extractVariables = extractVariables;
exports.renderTemplateString = renderTemplateString;
exports.renderTemplate = renderTemplate;
exports.canApplyEvent = canApplyEvent;
exports.canEditPack = canEditPack;
exports.isOutstanding = isOutstanding;
exports.validateAttachmentScope = validateAttachmentScope;
exports.validEmails = validEmails;
exports.normalizeRecipients = normalizeRecipients;
exports.PACK_STATUSES = ['prepared', 'downloaded', 'marked_sent', 'needs_attention', 'superseded'];
exports.PACK_TYPES = ['client', 'manufacturer', 'delivery_recipient'];
/** Fields a pack may change directly (pre-download only). */
exports.EDITABLE_PRE_DOWNLOAD = ['subject', 'body', 'recipients_snapshot', 'attachment_file_ids'];
// ── Template rendering ─────────────────────────────────────
//
// Templates are plain text with {{snake_case}} placeholders. Values
// are sanitised so a value can never inject a NEW placeholder or
// control characters, and rendering is single-pass (a value that
// happens to contain "{{x}}" is not re-expanded).
const PLACEHOLDER_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
// Strip control chars but keep tab (\x09) and newline (\x0A).
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
function sanitizeValue(v) {
    return String(v ?? '')
        .replace(/\{\{|\}\}/g, '') // strip brace pairs (anti-injection)
        .replace(CONTROL_RE, '')
        .slice(0, 2000);
}
/** Unique {{variables}} referenced by a template string. */
function extractVariables(template) {
    const out = new Set();
    let m;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((m = PLACEHOLDER_RE.exec(template)) !== null)
        out.add(m[1].toLowerCase());
    return [...out];
}
function renderTemplateString(template, vars) {
    const missing = [];
    const text = template.replace(PLACEHOLDER_RE, (_full, keyRaw) => {
        const key = String(keyRaw).toLowerCase();
        const val = vars[key];
        if (val === undefined || val === null || val === '') {
            missing.push(key);
            return '';
        }
        return sanitizeValue(val);
    });
    return { text, missing: [...new Set(missing)] };
}
function renderTemplate(subjectTemplate, bodyTemplate, vars) {
    const s = renderTemplateString(subjectTemplate, vars);
    const b = renderTemplateString(bodyTemplate, vars);
    return { subject: s.text.replace(/\s+/g, ' ').trim(), body: b.text, missing: [...new Set([...s.missing, ...b.missing])] };
}
// ── Pack state machine ─────────────────────────────────────
const ALLOWED_EVENTS = {
    prepared: ['edited', 'downloaded', 'marked_sent', 'needs_attention'],
    downloaded: ['downloaded', 'marked_sent', 'needs_attention'],
    needs_attention: ['marked_sent', 're_prepared'],
    marked_sent: ['needs_attention', 're_prepared'],
    superseded: [],
};
function canApplyEvent(status, event) {
    return (ALLOWED_EVENTS[status] ?? []).includes(event);
}
/** Direct field edits are only allowed before the pack is downloaded. */
function canEditPack(status) {
    return status === 'prepared';
}
/** A pack that was prepared but never marked sent, or needs attention. */
function isOutstanding(status) {
    return status === 'prepared' || status === 'downloaded' || status === 'needs_attention';
}
// ── Attachment-scope validation ────────────────────────────
//
// A pack may only attach files that belong to its own entities.
// `allowed` is the set of document_files ids generated for the
// pack's entity/entities; anything else is rejected.
function validateAttachmentScope(requested, allowed) {
    const allowSet = new Set(allowed);
    const invalid = requested.filter(id => !allowSet.has(id));
    const accepted = requested.filter(id => allowSet.has(id));
    return { ok: invalid.length === 0, invalid, accepted };
}
// ── Recipient helpers ──────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validEmails(values) {
    const out = [];
    for (const v of values) {
        const s = String(v ?? '').trim();
        if (s && EMAIL_RE.test(s) && !out.includes(s))
            out.push(s);
    }
    return out;
}
function normalizeRecipients(input) {
    const r = (input ?? {});
    return {
        to: validEmails(Array.isArray(r.to) ? r.to : []),
        cc: validEmails(Array.isArray(r.cc) ? r.cc : []),
        names: (r.names && typeof r.names === 'object') ? r.names : {},
    };
}
