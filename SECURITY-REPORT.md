# FBA Platform — Security Audit Report

**Date:** 2026-05-27  
**Scope:** Full codebase — `fba-platform/` (Next.js 14, Supabase, Resend, custom JWT auth)  
**Status:** All findings fixed. ✅

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
| `app/api/quote-requests/route.ts` | Fixed ownership check order (check before fetch) |
| `app/api/service-enquiries/route.ts` | Added email format validation |
