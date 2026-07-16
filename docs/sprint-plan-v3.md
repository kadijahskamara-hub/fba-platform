# FBA Platform — Sprint Plan v3 (16 Jul 2026)

Sources: `fba backend amend prompt.docx` (QA test-drive findings, items 1–17) and
`FBA_Product_Page_Custom_Match_Claude_Cowork_Prompt.md` (product page + Custom Match/COM build).
Continues from Sprint 7.1 (origin/main = 50b209a pending push). Review-first workflow: build
locally, Kadijahta reviews before commit/push/deploy.

Note: QA item 9 (Material Config options invisible on the public product page) is intentionally
deferred out of Sprint 9 — it is solved properly by the finish-group system in Sprints 10–13.

---

## Sprint 8 — Revenue workflow + data integrity (QA P0–P2, items 1–7)

1. **Invoices unified (item 1).** Quote Pipeline "Issue Invoice" must create a real
   `sales_invoices` ledger record (it currently only stamps invoice identity on the proforma and
   freezes a document snapshot). Add the missing "Create Invoice" action on an accepted
   Commercial Order (API `POST /api/admin/commercial-orders/[id]/invoices` already exists —
   UI wiring is missing).
2. **Record payment (item 2).** `POST /api/admin/payments` + `recordPayment()` already exist;
   there is no UI. Add Record Payment action on `/admin/payments` and on the commercial order,
   with confirm + allocation so the "client balance not satisfied" delivery blocker can clear.
3. **Supplier cost autopopulation (item 3).** `products.supplier_cost` exists but proforma line
   seeding hard-codes `supplier_cost_source: 'unavailable'`. Seed from the catalogue
   (`catalogue_supplier` source) on quote-request conversion and on catalogue product add.
4. **Proforma prepopulation (item 4).** Conversion seeds from `quote_request_items`; find why the
   QA pass saw "No lines yet" (likely the convert call or the public form path) and fix + harden.
5. **One reference per record (item 5).** Single display reference (quote number) across pipeline
   header, editor, documents list and packs; proforma number remains the issued-document number only.
6. **Trade application identity (item 6).** Never attribute the application to the active session
   unless the session email matches the submitted email; always store submitter identity.
7. **Send Detailed Form (item 7).** Make it produce a visible output (communications record +
   Resend email where configured) or remove the button.

Acceptance: verify against existing TEST records (TEST — Artisan Studio Verde, TEST — Placeholder
Lounge Chair, FBA-Q-2026-0003 / FBA-SO-2026-0007, FBA-PO-2026-0002, FBA-DEL-2026-0001). Do not
delete TEST records. tsc + unit tests + production build green.

## Sprint 9 — Public rendering + admin UX (QA P3–P4, items 8, 10–15)

- Item 8: hide/em-dash zero or empty optional numeric specs (no more "0WEIGHT 28kg").
- Item 10: dedupe brand suffix in product `<title>` template.
- Item 11: refresh/optimistic UI after create/add actions (delivery lines, accounting periods, sweep others).
- Item 12: replace native `confirm()` with in-app confirmation modals.
- Item 13: commercial order base route — overview page (or redirect to /procurement).
- Item 14: responsive width audit of admin tables/layouts.
- Item 15: add address + email to Artisan/Supplier records; surface on PO order sheets.
- P5 decisions to Kadijahta (no code): item 16 (Darlington Orji account: permissions or archive),
  item 17 (automated transactional email in scope for launch?).

## Sprint 10 — Custom Match/COM data model (md doc §14, Phase 2)

Additive, reversible migrations: `material_types`, `finishes` (library), `product_finish_groups`,
`product_finish_options`, `finish_compatibility_rules`, `product_specifications` (structured),
technical passport extension, `custom_match_requests` + attachments (private bucket),
`product_media` (Supabase Storage), `*_finish_selections` snapshot tables for project/quote/order
items. RLS on; service-role access only where appropriate.

## Sprint 11 — Admin editors (md doc §15, Phase 3)

Product editor sections (images/gallery, specifications, finish groups/options, compatibility,
technical passport, SEO, publishing), reusable finish library + material types manager,
media manager (upload/replace/reorder/primary/alt/finish-linked), Custom Match admin queue +
detail (status workflow, feasibility, cost/lead-time adjustments, convert-to-quote).

## Sprint 12 — Public product page (md doc §4–§8, Phase 4)

Canonical `/the-edit/[slug]` route (SEO, OG, breadcrumbs), responsive gallery with
finish-specific imagery, finish-group tabs + swatches (multi-group simultaneous selection,
compatibility validation, completeness indicator), quantity stepper, structured spec panel,
pale-sage technical passport (verified/active/non-expired only), backend-driven FINISH TYPE
filter on the catalogue. Resolves QA item 9.

## Sprint 13 — Custom Match modal + persistence (md doc §9–§11, Phase 5)

Accessible modal (focus trap, Escape, scroll lock, mobile full-height), material-type-conditional
fields, secure attachment uploads, reference numbers, statuses, notifications, Save to Project and
Request Quote carrying full configuration (quantity + all finish selections + Custom Match link).

## Sprint 14 — Commercial integration (md doc §12–§13, Phase 6)

Quote lines showing every finish selection, immutable snapshots on acceptance/order creation,
supplier order sheet (no margin/client data) vs client order summary (no supplier cost),
procurement dashboard Custom Match exception states, backend-generated tear sheet.

## Sprint 15 — Quality pass (md doc §17–§21, Phase 7)

Security review (RBAC, uploads, server-side recalculation), WCAG 2.2 AA pass, performance/SEO,
unit + component + E2E journey tests, production build, regression review, handover doc
`docs/product-page-custom-match-implementation.md`.
