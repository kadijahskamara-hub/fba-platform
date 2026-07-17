# Product Page, Finish Selection & Custom Match/COM — Implementation Handover

Built across Sprints 10–15 (16–17 Jul 2026) per the implementation brief.
Everything below is connected to Supabase — no hard-coded arrays, no
browser-only state, no fake submissions.

## 1. What was built

- **Sprint 10 — data model.** Material types (12 seeded), reusable finish
  library, per-product finish groups/options with price & lead-time
  adjustments, pairwise compatibility rules, structured product media,
  admin-orderable spec rows, technical passport attributes, Custom Match
  requests (FBA-CM-YYYY-NNNN numbering, 15-status workflow) + private
  attachments, finish-selection snapshot tables. Pure domain logic in
  `lib/customMatch/logic.ts` (status transitions, configuration
  completeness, compatibility validation, attachment rules).
- **Sprint 11 — admin.** `/admin/finishes` (material types + finish
  library, texture uploads), `/admin/products/[slug]/configuration`
  (finish groups, media manager, technical passport, spec rows),
  `/admin/custom-match` queue + detail (server-enforced transitions,
  assignment, feasibility, approvals, signed attachment links).
- **Sprint 12 — public product page.** Curated finish selector
  (multi-group selections that never erase each other, compatibility
  blocking with explanations, live completeness, quantity stepper),
  structured-media gallery with finish-specific image switching, pale-sage
  Technical Passport panel (public + verified + unexpired only), spec rows
  in the specification table, working Save to Project (configured items,
  server-revalidated, snapshots; same product saveable in multiple
  configurations), backend-driven FINISH TYPE filter.
- **Sprint 13 — Custom Match modal.** Accessible dialog matching the
  reference; material-conditional dimension fields; public submit endpoint
  (rate-limited, honeypot, submitted-identity-only) returning the FBA-CM
  reference on screen; secure attachment uploads (private bucket, 1-hour
  window, 5 files, strict allowlist).
- **Sprint 14 — commercial integration.** Quote requests remember their
  project item so conversion copies exact structured selections onto quote
  lines; Custom Match convert-to-quote builds a fully-specified line
  (spec block, internal cost adjustment, links, transition-enforced
  status); client documents render selections + CM spec (internal figures
  never rendered); supplier POs carry finish/spec snapshots without client
  pricing; operations hub flags unresolved Custom Match; tear sheet
  renders curated finishes + verified passport claims.
- **Sprint 15 — quality.** Security sweep (see §6), FK covering indexes,
  E2E data probe, this document.

## 2. Routes added or amended

Public: `/products/[slug]` (reworked), `GET /api/products/[slug]/configuration`,
`POST /api/custom-match`, `POST /api/custom-match/[id]/attachments`,
`GET /api/products/filters` + `GET /api/products` (finish-type filter, field
stripping), `POST /api/projects/[id]/items` (configured saves),
`POST /api/quote-requests` (project-item lineage), tear-sheet route.

Admin UI: `/admin/finishes`, `/admin/products/[slug]/configuration`,
`/admin/custom-match`, `/admin/custom-match/[id]`.

Admin API: `material-types`, `finishes` (+`[id]/texture`),
`products/[id]/finish-groups` (+options), `products/[id]/compatibility`,
`products/[id]/media`, `products/[id]/passport`, `products/[id]/spec-rows`,
`custom-match` (+`[id]`, `[id]/convert-to-quote`), `staff` GET.

## 3. Key components

`app/products/[slug]/CuratedFinishes.tsx` (selector + Save-to-Project
modal + Custom Match embed), `CustomMatchModal.tsx`, `CustomMatchLauncher.tsx`,
`ProductDetailClient.tsx` (gallery; listens for `fba:finish-selected`),
`components/admin/ProductConfigurationPanel.tsx`, `lib/publicProduct.ts`
(single shaping function for the public payload), `lib/customMatch/logic.ts`
(pure; unit-tested), `lib/appConfirm.ts`.

## 4. Migrations (all applied to production)

`20260716_sprint10_custom_match_model.sql` (tables, seeds, buckets,
FBA-CM sequence) · `20260717_sprint12_public_product_page.sql` (dropped
unique(project_id,product_id) on project_items) ·
`20260717_sprint14_commercial_integration.sql`
(quote_request_items.project_item_id) · `20260717_sprint15_quality_pass.sql`
(22 FK covering indexes). All additive; RLS enabled, service-role only.

## 5. Storage

`product-media` (public): product/gallery/finish texture images, path
`products/<id>/…` and `finishes/<id>/…`, random keys.
`custom-match` (private): request attachments `requests/<id>/…`; access via
1-hour signed URLs in the admin detail only.

## 6. Security model

- All admin mutations authorised server-side (`isStaff` / `requireCommercial`).
- Public payloads never contain finish supplier/supplier_reference;
  option price adjustments only for trade/staff sessions.
- `supplier_cost` stripped from all public product APIs and page props;
  `trade_price` only for trade accounts (Sprint 15 fix — previously the
  full row leaked to any visitor via `select *`).
- Selections are revalidated server-side from option IDs only; prices and
  labels always come from the database, never the client.
- Custom Match submissions store the SUBMITTED identity; a logged-in
  session is linked only when its email matches.
- Uploads: MIME + extension agreement, size caps, random keys, private
  bucket, post-submission window, per-request file cap, rate limits.
- Passport claims render publicly only when active + public + verified +
  unexpired.
- Client PDFs render from frozen snapshots and never touch the
  snapshot's `internal` block; supplier POs exclude client pricing.

## 7. Admin how-to (md doc §24.15)

1. **Create a product** — Admin → Products → New; fill basics; Save.
2. **Gallery images** — product → *Configuration* → Images & Media →
   upload (first image becomes primary); set alt text; link an image to a
   finish option for finish-specific switching.
3. **Two finish groups** — Configuration → Finish Groups → add e.g.
   "Tabletop" (Marble/Stone, required) and "Base" (Metal, required); add
   options from the library (create finishes under Admin → Finish Library
   first, with hex or texture); set a default; add price/lead adjustments;
   optionally add an incompatible pair with an explanation.
4. **Technical passport** — Configuration → Technical Passport → add
   claim (e.g. "Crib 5 Fire Retardant") → tick Public AND Verified; set
   expiry if certificate-bound.
5. **Publish** — product editor → visibility Published.
6. **Review a Custom Match** — Admin → Custom Match → open the FBA-CM
   reference; assign, set feasibility/cost/lead adjustments, move status
   with the workflow buttons (only legal moves are offered).
7. **Convert to quote** — move to Approved → *Convert to quote line*;
   open the linked quote from the request.
8. **Verify on order sheets** — issue the quote (client PDF shows
   selections + CM spec); accept → commercial order → generate the PO
   (spec present, no client pricing; supplier cost visible internally).

## 8. Environment & credentials

No new environment variables. Uses existing `NEXT_PUBLIC_SUPABASE_URL`,
service-role key (server only), `AUTH_SECRET`. Email remains the manual
prepared-pack model (owner decision 16 Jul: automated sending out of
scope for launch).

## 9. Testing & verification

166 unit tests green (`npm test`), covering status transitions,
configuration behaviour (§5.2 non-erasure), compatibility, completeness,
adjustments, attachment validation, dimension filtering. Production
builds verified on the owner's machine each sprint. Live DB probes
(insert + rollback) verified the full relationship chain end to end.
Manual E2E journey (md doc §21) is scripted in each sprint's handback.

## 10. Known limitations / deferred

- `order_item_finish_selections` as a separate table was intentionally
  not created: commercial orders consume proforma lines, and the finish
  data reaches POs/invoices via the line snapshots (`selected_finish`,
  `spec_details`, `quote_item_finish_selections`) — a dedicated table
  would duplicate the same facts.
- Full-screen gallery zoom (optional in the brief) not implemented.
- Legacy `product_finishes`/`products.images` remain for unmigrated
  products; the page falls back automatically. Retire them after the
  catalogue is migrated onto finish groups + product_media.
- Automated transactional email intentionally out of scope (P5 decision);
  the admin queues are the system of record.
