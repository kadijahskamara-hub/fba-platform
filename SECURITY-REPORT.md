# FBA Platform — Security Audit Report

**Date:** 2026-05-27 (updated 2026-07-12 — Next.js 15 upgrade + jsPDF/DOMPurify fix)  
**Scope:** Full codebase — `fba-platform/` (Next.js 15, Supabase, Resend, custom JWT auth)  
**Status:** All findings fixed. ✅ See the addenda at the end for new controls, the framework upgrade, and residual risks.

---

## Summary

| Severity | Found | Fixed |
|----------|-------|-------|
| Critical | 1 | ✅ 1 |
| High | 6 | ✅ 6 |
| Medium | 5 | ✅ 5 |
| Low | 2 | ✅ 2 |

---

## Critical

### C1 — `DISABLE_OTP=true` in `.env.local` ✅ Fixed

**File:** `.env.local`

**Risk:** Admin and staff accounts bypassed OTP second-factor entirely. Any attacker who guessed or brute-forced a staff password would gain full admin access with no second challenge.

**Fix applied:** Commented out the flag. It now reads:
```
# DISABLE_OTP=true  # WARNING: never enable in production — bypasses admin/staff 2FA
```

**Note:** If you need to disable OTP locally while DNS propagates, uncomment it only in your local `.env.local`. The production environment variable must be absent or set to `false`.

---

## High

### H1 — Mass assignment in `PATCH /api/products/[slug]` ✅ Fixed

**File:** `app/api/products/[slug]/route.ts`

**Risk:** The entire request body was spread directly into the Supabase update call (`{ ...body }`). An authenticated admin could overwrite any column including `id`, internal timestamps, or inject unexpected data types into the products table.

**Fix applied:** Replaced with an explicit allowlist of 20 permitted product fields. Any key outside the list is silently ignored.

---

### H2 — Mass assignment in `POST /api/admin/integrations` ✅ Fixed

**File:** `app/api/admin/integrations/route.ts`

**Risk:** Same pattern — `{ ...body }` passed directly to `supabaseAdmin.insert()`.

**Fix applied:** Explicit allowlist of 8 permitted integration fields.

---

### H3 — Mass assignment in `PATCH /api/admin/integrations/[id]` ✅ Fixed

**File:** `app/api/admin/integrations/[id]/route.ts`

**Risk:** Same as H2 for the update path.

**Fix applied:** Same allowlist applied to the PATCH handler.

---

### H4 — Stored XSS in tear-sheet HTML endpoint ✅ Fixed

**File:** `app/api/products/[slug]/tear-sheet/route.ts`

**Risk:** Product fields (name, description, artisan name, specs, image URL) were interpolated directly into a raw HTML response without escaping. Any HTML/JS stored in those fields would execute in the browser of any trade client who opened their tear sheet.

**Fix applied:** Added an `h()` HTML-escaping function and applied it to every value interpolated into the HTML template.

---

### H5 — `lib/supabase.ts` missing `server-only` guard ✅ Fixed

**File:** `lib/supabase.ts`

**Risk:** `supabaseAdmin` uses the `SUPABASE_SERVICE_ROLE_KEY` and bypasses all Supabase RLS policies. Without `import 'server-only'`, a developer could accidentally import this module in a Client Component.

**Fix applied:** Added `import 'server-only'` as the first line. Next.js will now throw a build-time error if this module is ever imported from a client component.

---

### H6 — Missing HTTP security headers ✅ Fixed

**File:** `next.config.js`

**Risk:** No security headers were configured, leaving the app vulnerable to clickjacking, MIME-type confusion attacks, and lacking a Content Security Policy.

**Fix applied:** Added the following headers applied to all routes:

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | Restricts scripts, styles, images, fonts, and connections to known origins |

**Note:** The CSP currently uses `unsafe-inline` for scripts (required by Next.js). Migrating to a nonce-based CSP would further tighten this as a future hardening step.

---

### H7 — No rate limiting on auth endpoints ✅ Fixed

**Files:** `app/api/auth/login/route.ts`, `app/api/auth/verify-otp/route.ts`

**Risk:** Unlimited brute-force attempts on both endpoints.

**Fix applied:** Created `lib/rateLimit.ts` — an in-memory rate limiter — and applied it:
- **Login:** 10 attempts per IP per 15-minute window
- **OTP verify:** 5 attempts per IP per 10-minute window (plus M4 per-user limit)

**Note:** On serverless deployments with multiple instances, replace the in-memory store with Redis/Upstash to share state across instances.

---

## Medium

### M1 — Quote-request ownership check after item fetch ✅ Fixed

**File:** `app/api/quote-requests/route.ts`

**Risk:** When `projectId` was supplied, project items were fetched from the DB before the ownership check confirmed the project belonged to the requesting user. The items were discarded if ownership failed, but the unnecessary DB read and inverted logic was a latent bug risk.

**Fix applied:** Reordered so the ownership check runs first. Items are only fetched once the project is confirmed to belong to the session user.

---

### M2 — No email format validation in service enquiries ✅ Fixed

**File:** `app/api/service-enquiries/route.ts`

**Risk:** The email field was checked for existence but not validated as a properly formatted address. A malformed value could be stored in the contacts table.

**Fix applied:** Added regex validation before processing:
```ts
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
if (!emailRegex.test(email.trim())) { ... }
```

---

### M3 — SSRF risk in sync engine ✅ Fixed

**File:** `lib/syncEngine.ts`

**Risk:** The sync engine made outbound HTTP requests to URLs stored in the `brand_integrations` table. A compromised admin account could set an endpoint to an internal network address (e.g. the AWS metadata service at `169.254.169.254`) to probe internal infrastructure.

**Fix applied:** Added `isAllowedEndpoint()` — validates that every URL is a public HTTPS address and rejects:
- Non-HTTPS schemes
- `localhost` / loopback addresses
- Private IPv4 ranges: `10.x`, `172.16–31.x`, `192.168.x`, `169.254.x`

Applied before every outbound `fetch` call across all four source types (Shopify, WooCommerce, CSV URL, Generic REST).

---

### M4 — OTP attempt counter missing ✅ Fixed

**File:** `app/api/auth/verify-otp/route.ts`

**Risk:** An attacker who rotated IPs could bypass the per-IP rate limit and make unlimited attempts against a valid `tempToken`.

**Fix applied:** Added a second, per-user rate limit layer using the decoded `userId` as the key (3 attempts per 10-minute window). This is independent of IP, so rotating IPs does not help. After 3 wrong codes the user must log in again to receive a fresh OTP.

---

### M5 — RLS disabled on `staff_otps` ✅ Fixed (post-audit discovery)

**Location:** Supabase — `staff_otps` table

**Risk:** Row Level Security was disabled on the `staff_otps` table. Since `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public (embedded in frontend JS), any browser could query the table directly — reading bcrypt-hashed OTP codes or inserting fake OTP records.

**Fix applied:** Migration `add_archived_to_user_status_enum` + `enable_rls_on_staff_otps` applied via Supabase MCP:
```sql
ALTER TABLE staff_otps ENABLE ROW LEVEL SECURITY;
```
With no policies defined, RLS defaults to deny-all for `anon` and `authenticated` roles. The `service_role` (used by `supabaseAdmin` in server-side code) bypasses RLS and retains full access — no application changes required.

**Verified:** All other 24 public tables have RLS enabled.

---

## Low

### L1 — GET `/api/auth/logout` removed ✅ Fixed (previous round)

**File:** `app/api/auth/logout/route.ts`

**Risk:** A GET-based logout endpoint is a CSRF vector — a malicious link can silently log users out.

**Fix applied:** Removed the GET handler. Logout now requires a POST request only.

---

### L2 — CSV file upload had no size limit ✅ Fixed

**File:** `app/api/admin/integrations/[id]/csv/route.ts`

**Risk:** Uploaded CSV files were read entirely into memory with no size check. A very large file could cause memory pressure on the server.

**Fix applied:** Added a 20MB limit check before reading the file:
```ts
const MAX_SIZE = 20 * 1024 * 1024 // 20MB
if (file.size > MAX_SIZE) {
  return NextResponse.json({ error: 'File too large. Maximum size is 20MB.' }, { status: 413 })
}
```

---

## What was intentionally not flagged

- **Auth flow** — JWT + httpOnly cookie pattern, OTP implementation (bcrypt-hashed codes, short expiry, single-use), and password reset (hashed tokens, 1-hour expiry) are all well-implemented.
- **Admin route protection** — all admin API routes consistently check `isStaff()` or `requireAdmin()`.
- **User-scoped data access** — projects, project items, and quote requests all verify `user_id === session.id`.
- **Password handling** — bcrypt at cost 12, email enumeration prevention on forgot-password, constant-time responses.
- **Supabase RLS** — the code correctly uses `supabaseAdmin` only in server-side routes. RLS has been verified and enabled on all tables. `staff_otps` was found with RLS disabled (post-audit discovery) and fixed via migration — see M5 below.

---

## All files changed

| File | Change |
|------|--------|
| `.env.local` | Commented out `DISABLE_OTP=true` |
| `lib/supabase.ts` | Added `import 'server-only'` |
| `lib/rateLimit.ts` | **New file** — in-memory rate limiter |
| `lib/syncEngine.ts` | Added `isAllowedEndpoint()` SSRF guard on all fetch calls |
| `next.config.js` | Added HTTP security headers |
| `app/api/auth/login/route.ts` | Added rate limiting (10 req / 15 min per IP) |
| `app/api/auth/verify-otp/route.ts` | Added IP rate limit (5 / 10 min) + per-user attempt limit (3 / 10 min) |
| `app/api/auth/logout/route.ts` | Removed GET handler |
| `app/api/products/[slug]/route.ts` | Fixed mass assignment with field allowlist |
| `app/api/products/[slug]/tear-sheet/route.ts` | Fixed stored XSS with HTML escaping |
| `app/api/products/route.ts` | Bounded `limit` param (max 100) |
| `app/api/admin/integrations/route.ts` | Fixed mass assignment with field allowlist |
| `app/api/admin/integrations/[id]/route.ts` | Fixed mass assignment with field allowlist |
| `app/api/admin/integrations/[id]/csv/route.ts` | Added 20MB file size limit |
| `app/api/admin/staff/[id]/route.ts` | Added runtime role/status validation |
| `app/api/quote-requests/route.ts
---

## Addendum — Commercial Pipeline Sprint 1 (2026-07-11)

### New security controls introduced

| Area | Control |
|------|---------|
| Ultra Admin | `users.is_ultra_admin` flag, read live from the DB on every request (never carried in the JWT). Ordinary admins cannot grant it: the staff-permissions path ignores `ultra_admin` / `commercial_settings_manage` keys entirely (`lib/commercial/permissions.ts`). |
| Granular permissions | 14 commercial permissions replace the single `quote_pipeline` key. Every commercial API route enforces them server-side via `requireCommercial()`; UI hiding is never relied on. Legacy `quote_pipeline` maps to view/create/edit only — pricing, discounts, approval, settings and issue rights are NOT inherited. |
| Protected settings | `commercial_settings` is served only by `/api/admin/commercial/settings` (never the generic site-settings route). Bank numbers are masked for non-Ultra viewers. Bank/VAT/company-identity changes require Ultra Admin + password re-confirmation (bcrypt compare, rate-limited 5/15min) + a mandatory reason. A 7-day session cookie alone is NOT sufficient. |
| Immutable audit | `commercial_setting_changes` and `issued_documents` have DB triggers that reject UPDATE/DELETE even under the service role. Bank values are masked before being written to the change log. General audit-list entries record field names only, never bank values. |
| Issued-document integrity | Issuing freezes a full JSON snapshot; documents always render from snapshots, never live rows. Locked records reject all mutation routes (409). Amendments require an explicit new revision; originals are preserved. |
| Server-authoritative money | One calculation engine (`lib/commercial/calculations.ts`, integer minor units) reruns on the server before every save/approval/issue. Client-supplied totals are cross-checked and rejected on mismatch (422). Prices/totals from the browser are never stored directly. |
| Approval gates | Threshold-driven approvals (margin/discount/cost-override) are computed server-side; issue is blocked at the API while approval is outstanding. Negative margins are blocked pending Ultra Admin. |
| Cost/margin confidentiality | Users without `quote_price_edit` receive API responses with cost/margin fields stripped. Client documents never contain cost, margin, markup, internal notes, or approval data (renderer reads only client-safe fields). |
| RLS | All new tables (`commercial_settings`, `commercial_setting_changes`, `service_catalogue`, `issued_documents`) have RLS enabled with no anon policies (service-role only), and the previously unmanaged `proformas` tables are baselined with RLS enabled in the repo migration. |
| Input validation | All commercial endpoints validate via typed helpers (`lib/commercial/validation.ts`): UUID/date/number/enum/percent checks, bounded strings, safe generic error messages. |

### Residual risks / limitations

1. **Reauthentication is password-based, not OTP-based.** The confirm-password flow satisfies "re-auth" but does not re-run the OTP factor. Adding an OTP challenge to sensitive settings changes is recommended in a later sprint.
2. **`contenteditable` reference documents.** The two standalone HTML reference files remain browser-editable by design but are documentation artefacts only; the operational renderer contains no `contenteditable` and no client-editable totals.
3. **Legacy manufacturer copies** still derive from the client pro forma (filtered, no totals for maker audience). They are explicitly marked transitional and must be replaced by purchase orders with supplier costs in a later sprint.
4. **In-memory rate limiting** (existing pattern) resets on server restart and is per-instance; acceptable at current scale.
5. **Settings-page gating**: the `/admin/settings` layout still requires the legacy `settings` staff permission for page access; the commercial settings API enforces its own permissions regardless.

---

## Addendum — Sprint 2: Supplier Purchase Orders (2026-07-11)

### New controls

| Area | Control |
|------|---------|
| Client/supplier separation | Purchase orders are a separate transaction chain (commercial_orders → supplier_allocations → purchase_orders). PO snapshots and the supplier acknowledgement page are built exclusively from supplier-side fields; client selling prices, FBA markup/margin, client fees/deposits, margin analysis, internal notes and other manufacturers never enter supplier payloads. A deep-scan guard (`findForbiddenSupplierFields`) exists and is unit-tested. |
| Acknowledgement tokens | 256-bit random tokens (base64url), stored **hashed** (SHA-256) with expiry and revocation. One active token per PO revision; issuing a new revision or cancelling revokes prior tokens. Public routes are rate-limited (view 30/10min/IP, acknowledge 10/10min/IP), single-use for responses, send `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, and `X-Frame-Options: DENY`. Tokens grant access to exactly one PO revision snapshot — nothing else. |
| Immutability | `purchase_order_snapshots` rejects UPDATE/DELETE at the DB level (trigger). Issued POs are locked; all mutation routes return 409; amendments require an explicit new revision with a recorded reason. Issued POs can only be *cancelled* (Ultra Admin + reason), never deleted. |
| Approval & segregation of duties | Threshold-driven approval (configurable PO-value/freight thresholds in commercial_settings — not hard-coded), inactive manufacturer, cost/quantity/currency deviations, manual cost overrides (reason required), and margin-at-risk all require `purchase_order_approve` (staff-grantable) or Ultra Admin. Preparers cannot approve their own POs (unless Ultra Admin). Ordinary admins are NOT granted approve rights implicitly. |
| Unknown supplier tax | Supplier tax defaults to `unknown` and blocks issue until explicitly confirmed — client VAT treatment is never assumed for suppliers. |
| Margin-at-risk | Supplier-cost deterioration against the source client order triggers internal flags and approval; analysis is stored in `margin_analysis` (internal only) and requires a resolution note before issue. Never exposed to suppliers or clients. |
| Honest send state | Issue sets `send_status = approved_not_sent`; nothing is marked "sent" without an actual dispatch (email automation deferred). |
| RLS | All six new tables have RLS enabled with no anon policies (service-role only). |
| Retired maker copies | New manufacturer-filtered client pro formas return 410; historic copies remain auditable via an explicit legacy flag and preserved download records. |

### Residual risks (carried forward / noted)

1. In-memory rate limits remain per-instance (documented in Sprint 1) — applies to the public acknowledgement routes; acceptable at current scale, Redis recommended before high-volume use.
2. Password reauthentication (Sprint 1 settings flow) is still not OTP-backed.
3. The acknowledgement link itself is the supplier's credential: anyone holding the URL within its validity window can view that one PO revision. Mitigations: hashing at rest, expiry, revocation on revision, no-referrer, rate limiting, audit logging of views. A per-supplier portal with authentication is deferred scope.

---

## Addendum — Sprint 3: Client Acceptance, Payments, Invoices and Credit Control (2026-07-12)

| Control | Implementation |
| --- | --- |
| Dedicated invoices | Invoices are now their own records (`sales_invoices` / `sales_invoice_lines`), never the `proformas` working record. Client invoice lines carry selling prices only; supplier cost, FBA markup and margin are never written to, or rendered from, an invoice. A unit-tested deep-scan guard (`findForbiddenClientInvoiceFields`) is invoked at render time and refuses to emit a document if any forbidden field is present. |
| Explicit client acceptance | Acceptance is a first-class, revision-specific record (`commercial_acceptances`) bound to an immutable issued snapshot. `issued` is never treated as `accepted`. Stage/final invoicing is blocked until the source record is accepted. Admin-recorded acceptance requires a reason and an evidence note. |
| Acceptance tokens | 256-bit random tokens, stored SHA-256 hashed, expiring, revocable, one active per revision (a new revision revokes the prior token). Public routes are rate-limited, `noindex`, `no-referrer`, `no-store`, `X-Frame-Options: DENY`. IP is stored hashed, never raw. |
| Atomic financial operations | Acceptance, payment allocation, payment reversal, invoice issue, credit-note issue and credit-note allocation are performed by `SECURITY DEFINER` SQL functions in a single transaction. The **Sprint 2 supplier acknowledgement** was migrated to the atomic `acknowledge_purchase_order()` function (token consumption + PO update can no longer race into a duplicate response). |
| Derived balances | Invoice `amount_paid`, `credit_total` and `balance_due` are derived by `recompute_invoice_financials()` from confirmed payment allocations and issued credit-note allocations. They are never edited directly; the payment ledger is the source of truth. |
| Over-invoicing prevention | Stage/final invoices are checked against remaining invoiceable value (order gross + approved variations − prior invoices − credits). Allocation caps (payment balance, invoice balance, currency match) are enforced in the atomic functions **and** mirrored in unit-tested pure guards. |
| Invoice immutability | Issue freezes an immutable snapshot (`sales_invoice_snapshots`, `reject_mutation` trigger). A `guard_issued_invoice()` trigger rejects any post-issue change to invoice number, type, totals, currency, dates or company/bank/client snapshots — only derived money fields and void state may change. Issued invoices render only from their snapshot. Corrections use void-before-issue or credit notes. |
| Segregation of duties | New granular permissions: `invoice_view/create/approve/issue`, `payment_view/record/confirm/allocate/reverse`, `credit_note_create/approve`. Approval, confirmation, reversal and credit approval are Ultra-Admin-by-default and explicitly grantable to staff; ordinary admins cannot self-serve them. A recorder cannot confirm their own payment (unless Ultra Admin); a creator cannot approve their own credit note. Backdated payments beyond a configurable threshold require Ultra Admin. |
| Credit notes | Reference an issued invoice, cannot exceed the eligible invoice value, preserve tax treatment, require approval, freeze an immutable snapshot at issue, and reduce invoice balance only through allocation. |
| Audit | 21 new `commercial.*` events (acceptance, invoice, payment, receipt, credit-note lifecycle). Raw tokens and full bank data are never logged. |
| RLS | All twelve new tables have RLS enabled with no anon policies (service-role only). |

### Residual risks (Sprint 3)

1. In-memory rate limits remain per-instance — now also applies to the public client-acceptance routes. Redis recommended before high volume.
2. The acceptance link is the client's credential for one revision, mitigated as for PO tokens (hashed, expiring, revocable, rate-limited, no-referrer, audited).
3. Multi-currency payment allocation is blocked outright (no conversion workflow) — intentional for this sprint.
4. Reminder-email delivery, gateway/bank-feed integration and accounting sync remain deferred (`reminder_status` fields are prepared but no email is sent).

---

## Addendum — Next.js 15 framework upgrade (2026-07-12)

**Change:** Upgraded `next` and `eslint-config-next` from **14.2.35** to **^15.5.18** (staying on the 15.x line; 16.x deliberately avoided as it previously broke our dynamic routes). React and React DOM remain on 18 to minimise change surface — Next 15 supports React 18 and 19, and nothing in the codebase requires 19.

**Why:** Next.js 14.x is end-of-life for security. The **May 2026 security release** patched only **15.5.18+ / 16.2.6+**; earlier 15.x/16.x minors will not receive fixes. Running 14.2.35 left the platform exposed to a batch of advisories (`npm audit` was reporting ~14 unpatched `next` findings). The upgrade moves the framework onto the only supported, patched 15.x baseline.

### Advisories closed by the version bump

The 15.5.18 release rolls up the May 2026 advisory set (publicly summarised as 7 high, 4 moderate, 2 low, plus one upstream React issue). Relevance to FBA's actual usage:

| Advisory (May 2026 set) | Severity | Relevance to FBA |
| --- | --- | --- |
| App Router / Pages Router **middleware / proxy bypass** | High | **Directly relevant.** `middleware.ts` is our auth gate for `/account`, `/admin` and `/trade/dashboard`. A middleware-bypass defeats those role checks — this is the most important fix for us. |
| **RSC response cache poisoning** | High | Relevant — App Router with React Server Components throughout. |
| **SSRF via WebSocket upgrade** | High | Low practical exposure (no WebSocket endpoints), closed regardless. |
| Connection exhaustion with **Cache Components** | High | Not applicable — Cache Components (experimental) not used. |
| **RSC / rendering DoS** | High | Relevant — reduces unauthenticated render-path DoS surface. |
| **Image Optimization API DoS** | Moderate | **Relevant.** `next/image` is used with `remotePatterns` (see residual risk below). |
| **XSS via CSP nonce** | Moderate | Not applicable — our CSP uses `'unsafe-inline'`, not a nonce strategy (its own weakness, tracked separately; the nonce-specific bug does not apply). |
| **XSS via `beforeInteractive` scripts** | Low | Not applicable — no `beforeInteractive` `next/script` usage. |
| Upstream **React Server Components** issue | — | Closed by the bundled React runtime fix shipped with 15.5.18. |

After `npm install`, `npm audit` should no longer list the `next` advisories. Re-run it as part of verification (see the build steps handed to the maintainer).

### Breaking change handled — async `params` / `searchParams`

Next 15's largest breaking change: dynamic **`params`** and **`searchParams`** are now Promises. Every dynamic route handler, page, layout and `generateMetadata` that reads a route parameter had to `await` it, or the build fails / the value is `undefined` at runtime.

| Area | Migrated |
| --- | --- |
| API route handlers (`app/**/[…]/route.ts`) | 86 handlers across ~60 files. Signature changed to `ctx: { params: Promise<{ … }> }` and `const params = await ctx.params` added; all downstream `params.id` / `.slug` / `.token` / `.itemId` / `.allocId` / `.lineId` / `.noteId` references left intact. Includes the `type Params` alias case (`retail-orders/[id]`). |
| Server pages / `generateMetadata` (`app/**/[…]/page.tsx`) | All dynamic pages, including `interface Props` and multi-line-typed variants. One non-async server page (`admin/clients/[id]/statement`) was made `async`. `searchParams`-consuming server pages (`products`, `admin/products`, `admin/dashboard`) migrated the same way. |
| Client components using `useSearchParams()` | **No change required** — the hook is unchanged in Next 15. The `(auth)` pages, `quote`, `checkout/success` and `admin/contacts` were correctly left alone. |
| Route-handler `searchParams` from `req.nextUrl` | **No change required** — that is the Web `URL` API (always synchronous), not the async prop. |

Verified statically: zero remaining un-wrapped `params:`/`searchParams:` prop types; every server file that reads `params.`/`searchParams.` either awaits it or uses the sync Web API / client hook; no `await` was introduced into a non-async function. Final confirmation is `npm run build` (Next 15 type-checks handlers against its generated route/page types, so any missed file fails the build).

### Breaking change handled — async `cookies()`

Next 15 also made **`cookies()` / `headers()` / `draftMode()`** (from `next/headers`) return Promises. The only consumer is `lib/auth.ts` (our session layer), which called `cookies()` synchronously in three places:

- `createSession()` → `(await cookies()).set(...)`
- `getSession()` → `(await cookies()).get(...)`
- `destroySession()` was made `async` → `(await cookies()).delete(...)`; its sole caller, `POST /api/auth/logout`, now `await`s it.

`createSession`'s callers (login, register, verify-otp) already awaited it. No use of `headers()` or `draftMode()` exists in the codebase.

### Configuration changes

- `next.config.js`: `experimental.serverComponentsExternalPackages` (for `bcryptjs`) was renamed to the now-stable top-level **`serverExternalPackages`** — the Next 15 rename. Security headers / CSP and the `images` block are otherwise unchanged.
- `middleware.ts`: no code change needed — it uses only stable APIs (`nextUrl`, `cookies`, `jose` JWT verify). The proxy/middleware-bypass advisories are fixed inside the framework by the version bump, not in our code.

### Residual risks (Next.js 15 upgrade)

1. **`images.remotePatterns` still allows `hostname: '**'`** (any HTTPS host). The Image Optimization **DoS** is patched by 15.5.18, but a fully open remote-image allowlist remains an abuse/SSRF-adjacent surface (the optimizer will fetch arbitrary attacker-supplied HTTPS URLs). Carried forward intentionally because product images are imported from arbitrary supplier CDNs; the standing plan is to mirror imported images into Supabase Storage and then restrict `remotePatterns`.
2. **CSP uses `'unsafe-inline'` / `'unsafe-eval'`** in `script-src` (required by styled-jsx and current inline usage). This is a pre-existing weakness unrelated to the upgrade and is not addressed here; a nonce-based CSP is the long-term fix.
3. Next 15 makes `GET` route handlers and `fetch` **uncached by default**. This is safer (no accidental caching of authenticated responses) and matches how these Supabase-backed routes already behave; no action required, noted for completeness.

---

## Addendum — jsPDF 2 → 4 upgrade (DOMPurify advisories) (2026-07-12)

**Change:** Upgraded `jspdf` from **^2.5.1** to **^4.2.1**.

**Why:** After the Next 15 upgrade, `npm audit` reported the remaining findings as a **critical** and a **moderate** advisory, both from **DOMPurify** pulled in transitively by the old `jspdf` (jsPDF `<= 4.2.0` depends on a vulnerable DOMPurify — a batch of XSS / prototype-pollution / sanitisation-bypass CVEs). `jspdf@4.2.1` ships a patched DOMPurify and clears both.

**Exposure assessment:** DOMPurify is only reached via jsPDF's `doc.html()` rendering path. The jsPDF consumers in this codebase — the trade programme info pack (`app/api/trade/application-form.pdf`), the product tear sheet (`app/api/products/[slug]/tear-sheet`), and the project FF&E schedule (`app/account/projects/[id]/export`) — **do not use `.html()`, `autoTable`, `fromHTML`, or any filesystem/font-loading API.** They use only core drawing primitives (`text`, `rect`, `line`, `circle`, `splitTextToSize`, `addImage`, `addPage`, `setFont`, `output('arraybuffer')`), so the vulnerable code path was never invoked at runtime. The advisory was a transitive-dependency hygiene issue rather than a live exposure; the bump removes it regardless.

**Code impact:** jsPDF 4.0's one breaking change (restricting filesystem access by default) does not affect these routes, and every API they call is stable across 2.5 → 4.x. Verified with a PDF-output smoke test of the trade route after the bump. (The tear-sheet and FF&E-schedule routes were separately converted from HTML to real jsPDF PDFs as a product change — see the FF&E PDF note below — which is why they now import jsPDF; they remain on the core drawing API only.)

After `npm install`, `npm audit` should report **0 vulnerabilities**.

---

## Addendum — Tear sheet & FF&E schedule converted to real PDFs (2026-07-12)

Product change (not a security fix), enabled by the jsPDF 4 upgrade:

- **Product tear sheet** (`app/api/products/[slug]/tear-sheet`) now returns a generated A4 PDF instead of an HTML page. The product image is fetched server-side and transcoded to JPEG with **`sharp`** (added dependency; also registered in `serverExternalPackages`) so any source format — WebP/AVIF/PNG/JPEG — embeds reliably; on fetch/transcode failure it degrades to a neutral placeholder. This also fixes a latent mismatch where the product page already offered the link with a `.pdf` download filename while the route served HTML. Image fetches are bounded by a 7s timeout.
- **Project FF&E schedule** (`app/account/projects/[id]/export`) gains a `format=pdf` branch (landscape jsPDF table with pagination) alongside the existing `format=csv` (default) and `format=html`. The project page now exposes all three — **Export CSV**, **Export PDF**, **Print** (HTML). The ownership check (project must belong to the session user) and trade-pricing gating are unchanged and still run before any output is produced.

Both routes escape nothing into HTML (PDF text is literal) and use only the jsPDF core drawing API.
