# FBA Platform — Full Bloom Artelier

A trade, retail, procurement and artisan product platform built with Next.js 14, Supabase and TypeScript.

**Studio:** London, UK  
**Founder:** Kadijahta Kamara  
**Domain:** [www.fullbloom.uk.com](https://www.fullbloom.uk.com)  
**Contact:** info@fullbloom.uk.com

---

## What is Full Bloom Artelier?

Full Bloom Artelier is a **luxury design procurement studio** that connects interior designers, architects, and hospitality developers with the world's finest makers — hand-vetted, technically compliant, and ready for demanding residential and hospitality projects globally.

The platform serves two audiences:
- **Trade (B2B):** Interior designers, architects, hospitality developers — trade pricing, project folders, FF&E schedules, and quote pipelines
- **Retail (B2C):** Design-conscious consumers browsing and purchasing curated design pieces

---

## What's built

### Authentication & user system

- **Six roles:** `guest`, `retail_customer`, `trade_applicant`, `trade_user`, `staff`, `admin`
- **JWT sessions** — httpOnly cookie (`fba_session`, 7-day expiry) via `jose`
- **Registration and login** — bcrypt password hashing, no third-party auth dependency
- **Email OTP 2FA** — staff and admin logins trigger a 6-digit code via Resend, stored hashed in `staff_otps` (10-min expiry), polished digit-by-digit verify page
- **Password reset** — full forgot-password / reset-password flow with time-limited tokens in `password_reset_tokens` and branded email
- **Route protection** — Next.js middleware guards `/account`, `/admin`, `/trade/dashboard` at the edge
- **Session headers** — middleware injects `x-user-id`, `x-user-role`, `x-user-email` for server components

### Trade application workflow

- Multi-step public application form at `/trade/apply`
- Status lifecycle: `pending → form_sent → under_review → approved / declined / revoked`
- Admin pipeline with filter tabs, real-time DB stat counts, and a full detail modal
- Actions: approve, decline, revoke, send detailed form, mark under review, add internal notes
- Approved applicants automatically gain `trade_user` role
- Transactional email notifications via Resend for all status changes
- Full applicant detail: VAT number, company registration, trade references, portfolio URL, annual spend estimate

### Product catalogue

- Full FF&E specification model: dimensions (W/D/H/seat height/diameter), materials, finish, fabric, lead time, COM availability
- Lighting-specific specs: bulb type, wattage, voltage, IP rating, cable length, dimmable flag
- Product option groups and values with price modifiers
- **Role-based pricing:** retail price / trade price / `price_on_request`
- **Audience control:** `retail_only` / `trade_only` / `retail_and_trade`
- **Visibility:** `draft` / `published` / `hidden`
- Quick view modal, full product detail page with image gallery, spec table, artisan profile, related products
- Print-ready tear sheet at `/api/products/[slug]/tear-sheet`
- JSON-LD structured data on every product page

### FBA Collection

- Dedicated collection page at `/collection` with URL-based filter tabs: All / Retail / Trade / Full Bloom Exclusives
- Trade-only pieces gated to `trade_user` role
- `is_fba_collection` flag; `limited-edition`, `retail-pieces`, `trade-pieces` subcategories

### Brand integration system

- Connect external catalogues via **Shopify**, **WooCommerce**, **REST API**, **CSV URL**, or **manual CSV**
- Dot-path field mapping with wildcard support (`variants.0.price`, `images.*.src`)
- Default mapping templates per source type; 9 mappable FBA fields
- All imported products land as `draft` for editorial review
- Sync history: timestamp, status, message, count
- Admin UI at `/admin/integrations`
- **Important:** `lib/syncEngineTypes.ts` is client-safe (types + constants only). `lib/syncEngine.ts` is server-only. Never import `syncEngine` in `'use client'` components — use `syncEngineTypes` instead.

### Project folders (FF&E schedules)

- Logged-in users create named project folders with location, budget and notes
- Save any product to a project from listing or detail page
- Project detail shows items table with images, prices, quantities and totals
- Request a quote for all items in a project

### Quote pipeline

- `POST /api/quote-requests` — submit from project folder or product page
- Standalone `/quote` page for direct product quoting
- Admin queue at `/admin/quotes` with full status lifecycle: `new → reviewing → quoted → accepted → converted_to_order`
- All quote contacts auto-captured in the contacts database

### Admin area

| Section | Path | Notes |
|---|---|---|
| Dashboard | `/admin/dashboard` | 6 stat cards, recent applications, pending action widget |
| Trade Applications | `/admin/trade-applications` | Full pipeline, detail modal, all actions, email notifications |
| Contacts | `/admin/contacts` | Searchable/filterable with source tracking |
| Products | `/admin/products` | List, add (4-tab form), edit |
| Artisans | `/admin/artisans` | Grid view, add form |
| FBA Collection | `/admin/collection` | Curated own-brand pieces |
| Brand Integrations | `/admin/integrations` | Connect and sync external catalogues |
| Quote Pipeline | `/admin/quotes` | Status management |
| Retail Orders | `/admin/retail-orders` | |
| Commercial Orders | `/admin/commercial-orders` | B2B / FF&E project orders |
| Journals | `/admin/journals` | Editorial CMS |
| Studio Settings | `/admin/settings` | **Admin only** |
| Staff & Permissions | `/admin/settings/staff` | **Admin only** |
| Archived Staff | `/admin/settings/staff/archived` | **Admin only** |

### Staff permission system

- Granular permission keys: `dashboard`, `trade_applications`, `products`, `artisans`, `retail_orders`, `commercial_orders`, `quote_pipeline`, `journals`, `settings`, `users`, `contacts`
- `AdminSidebar` filters nav items by the logged-in user's permissions
- Studio Settings protected at two independent layers: sidebar hides the link; `app/admin/settings/layout.tsx` server-redirects even on direct navigation
- **Explicit save pattern:** Permission toggles stage changes locally; a "Save Changes" button commits — no accidental auto-save. Dirty state shown with caramel card border.
- **Permission count summary:** Each staff card shows "X of 11 permissions granted" at a glance without opening the editor
- **Suspend / Reactivate:** Blocks login immediately; status reflected live on the card. Distinct outlined button (red = suspend, green = reactivate)
- **Archive:** Soft-removes leavers from the active list — blocks login like suspend but moves the record to `/admin/settings/staff/archived`. Archived staff retain their last-known permissions for reference. Admins can restore at any time
- **`UserStatus`** now includes `'archived'` alongside `'active'` and `'suspended'`

### Public site

- Full-screen hero, services marquee, artisan previews, journal previews
- Service enquiry form stored in `service_enquiries`
- Contact page at `/contact`
- About page with Technical Passport™ explainer
- All form submissions stored in `contacts` with source tracking and marketing consent

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router |
| Language | TypeScript (strict) |
| Database | Supabase (PostgreSQL) |
| Auth | jose JWT + httpOnly cookies |
| Password hashing | bcryptjs |
| Email | Resend |
| Images | Pexels CDN / Supabase Storage |
| Styling | CSS custom properties |
| Fonts | Cormorant Garamond, DM Sans, Brown Sugar |
| Deployment | Vercel |

---

## Local development setup

### 1. Install

```bash
cd "FBA business development/fba-platform"
npm install
```

### 2. Environment variables

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # Server-only — never expose to client

AUTH_SECRET=your-64-char-random-secret  # openssl rand -base64 64

RESEND_API_KEY=re_...
# DISABLE_OTP=true                    # LOCAL ONLY — bypasses admin/staff 2FA. NEVER enable in production.

NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 3. Database

In Supabase → SQL Editor, run `database/schema.sql`.

### 4. Brown Sugar font

Place at `public/images/brown-sugar.ttf`. Falls back to Cormorant Garamond if absent.

### 5. Run

```bash
npm run dev
```

### 6. Create first admin

Register at `/register`, then:

```sql
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
```

Visit `/admin/dashboard`.

---

## Project structure

```
fba-platform/
├── app/
│   ├── (auth)/
│   │   ├── login/                      — Login (OTP trigger for staff/admin)
│   │   ├── register/                   — Retail registration
│   │   ├── verify-otp/                 — 6-digit OTP verify
│   │   ├── forgot-password/            — Request password reset
│   │   └── reset-password/             — Set new password (token-gated)
│   ├── about/
│   ├── account/
│   │   └── projects/                   — My Projects + FF&E schedule detail
│   ├── admin/
│   │   ├── layout.tsx                  — Admin guard + permission-filtered sidebar
│   │   ├── dashboard/
│   │   ├── trade-applications/
│   │   ├── products/
│   │   ├── artisans/
│   │   ├── collection/
│   │   ├── integrations/
│   │   │   └── IntegrationForm.tsx     — 'use client' — imports syncEngineTypes only
│   │   ├── quotes/
│   │   ├── contacts/
│   │   ├── journals/
│   │   ├── retail-orders/
│   │   ├── commercial-orders/
│   │   └── settings/
│   │       ├── layout.tsx              — Server permission gate for entire settings subtree
│   │       ├── page.tsx
│   │       └── staff/
│   │           ├── page.tsx            — Active staff list (excludes archived)
│   │           └── archived/
│   │               └── page.tsx        — Archived staff + restore action
│   ├── api/
│   │   ├── auth/                       — register, login, logout, forgot/reset-password
│   │   ├── products/
│   │   ├── projects/
│   │   ├── quote-requests/
│   │   ├── service-enquiries/
│   │   ├── trade-applications/
│   │   └── admin/
│   │       ├── trade-applications/     — list, counts, [id] actions + email
│   │       ├── integrations/           — CRUD, sync, csv upload
│   │       └── staff/                  — permissions / role / status PATCH
│   ├── artisans/
│   ├── cart/
│   ├── collection/
│   ├── contact/
│   ├── journal/
│   ├── products/
│   ├── quote/                          — Standalone quote request page
│   ├── trade/apply/
│   ├── globals.css                     — All design tokens + UI patterns
│   └── layout.tsx / page.tsx
├── components/
│   ├── AdminSidebar.tsx                — Permission-filtered admin nav
│   ├── StaffEditor.tsx                 — Active staff list with permissions, suspend, archive
│   ├── ArchivedStaffViewer.tsx         — Archived staff list with restore action
│   ├── ProductCard.tsx / QuickView.tsx / PriceDisplay.tsx
│   └── Nav.tsx / Footer.tsx / MobileOverlay.tsx
├── database/
│   └── schema.sql
├── lib/
│   ├── auth.ts                         — getSession(), requireAdmin(), role helpers
│   ├── email.ts                        — Resend: OTP, approval, password reset emails
│   ├── pricing.ts                      — resolvePrice(), formatPrice()
│   ├── rateLimit.ts                    — In-memory rate limiter (login + OTP endpoints)
│   ├── supabase.ts                     — anon + service_role clients (server-only)
│   ├── syncEngine.ts                   — SERVER-ONLY sync functions (imports supabaseAdmin)
│   ├── syncEngineTypes.ts              — CLIENT-SAFE types + DEFAULT_MAPPINGS
│   └── types.ts                        — All shared TypeScript interfaces
└── middleware.ts                       — Edge route protection + session headers
```

---

## Key architecture decisions

**Sessions:** `jose` JWT in an httpOnly cookie. Middleware injects user headers so server components never need client-side state.

**Pricing:** All pricing logic in `lib/pricing.ts`. One function, one source of truth — `resolvePrice(product, session)` returns a discriminated union.

**Database:** Two Supabase clients. `supabase` (anon key, respects RLS) for public reads. `supabaseAdmin` (service_role, server-only) for admin writes. Never import `supabaseAdmin` in `'use client'` components.

**Sync engine split:** `syncEngineTypes.ts` (client-safe) vs `syncEngine.ts` (server-only). Client components import from `syncEngineTypes`. Server routes and server components import from `syncEngine`.

**Staff permissions:** Not stored in JWT (would go stale). Fetched fresh from `staff_permissions` table on each admin layout render. Enforced at the UI layer (sidebar) and the security layer (settings layout guard) independently.

---

## Row Level Security

| Table | Anon | Authenticated | service_role |
|---|---|---|---|
| `products` | Published | Published | Full |
| `artisans` | Active | Active | Full |
| `journal_posts` | Published | Published | Full |
| `projects` / `project_items` | None | Owner | Full |
| `trade_applications` | None | Own row | Full |
| `users` | None | Own row | Full |
| `staff_permissions` | None | None | Full |
| `brand_integrations` | None | None | Full |
| `contacts` / `service_enquiries` | INSERT | None | Full |
| `password_reset_tokens` | None | None | Full |
| `staff_otps` | None | None | Full |

---

## Deploying to Vercel

```bash
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/your-org/fba-platform
git push -u origin main
```

Import at [vercel.com/new](https://vercel.com/new). Set all environment variables from `.env.local` (plus `NEXT_PUBLIC_SITE_URL` set to your production domain). Deploy.

---

## Security

A full security audit was completed on 2026-05-27. All findings (1 Critical, 6 High, 4 Medium, 2 Low) have been resolved. See [`SECURITY-REPORT.md`](./SECURITY-REPORT.md) for the complete record.

Key protections in place:

- **OTP 2FA** for all admin and staff logins — bcrypt-hashed codes, 10-minute expiry, single-use
- **Rate limiting** on login (10 req/15 min) and OTP verify (5 req/10 min per IP, 3 attempts per OTP session)
- **HTTP security headers** — CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **Field allowlists** on all admin PATCH/POST endpoints — no mass assignment
- **HTML escaping** on all database values rendered into HTML (tear sheet)
- **SSRF protection** in the sync engine — all configured endpoints validated as public HTTPS before any outbound request
- **`server-only`** guard on `lib/supabase.ts` — prevents accidental client-side import of the admin (RLS-bypassing) client
- **POST-only logout** — GET logout removed to prevent CSRF-based session termination
- **20MB CSV upload limit** on the integrations CSV endpoint

> ⚠ **`DISABLE_OTP`**: This flag in `.env.local` bypasses admin/staff 2FA entirely. It is commented out by default. Only uncomment it locally when needed (e.g. while Resend DNS propagates). **Never enable it in production.**

---

## What's next

### Commerce
- [ ] Stripe integration — retail checkout and payment capture
- [ ] Retail order fulfilment pipeline
- [ ] Commercial order pipeline with milestone and payment tracking
- [ ] Downloadable FF&E schedules (PDF export from project folders)

### Content & discovery
- [ ] Full artisan profile pages `/artisans/[slug]`
- [ ] Public journal posts `/journal/[slug]`
- [ ] `sitemap.xml` + `robots.txt`
- [ ] Currency / region selector

### Platform operations
- [ ] Automated sync scheduling (Vercel cron or Supabase Edge Functions)
- [ ] Product analytics events (views, saves, quote conversions)
- [ ] Enforce OTP for all admin logins in production (remove `DISABLE_OTP` flag)
- [ ] Transfer Supabase project to Kadijahta's account

---

## Design tokens

```css
--forest:     #1A2B18   /* Primary brand green */
--cream:      #F7F3EE   /* Page background */
--warm-white: #FDFAF7   /* Card backgrounds */
--caramel:    #C4A882   /* Accent / highlights */
--sage-bg:    #8A9E85   /* Muted sage */
--stone:      #9E9589   /* Secondary text */
--light-line: rgba(196,168,130,0.18)  /* Borders */
--danger:     #c0392b   /* Destructive actions */
```

**Typography:** Brown Sugar (logo), Cormorant Garamond (display/headings), DM Sans (body).
