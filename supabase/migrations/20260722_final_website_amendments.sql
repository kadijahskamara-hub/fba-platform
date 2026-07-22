-- ============================================================
-- Final Website Development Amendments (260721 review PDF)
-- 2026-07-22
--
--  1. Artisans: archive lifecycle (bulk management on the admin
--     index). Archived artisans are always is_active = false so
--     every existing public query keeps working unchanged.
--  2. Categories: public visibility + archive lifecycle so the
--     studio/catalogue tabs can be hidden or archived without
--     touching each product.
--  3. Storage: dedicated public bucket for artisan/manufacturer
--     media (direct uploads replace pasted external URLs).
--     Writes happen only through server routes (service role);
--     anon/authenticated clients get read-only access.
-- ============================================================

-- ── 1. Artisan archive lifecycle ─────────────────────────────

alter table artisans
  add column if not exists archived_at timestamptz;

create index if not exists idx_artisans_lifecycle
  on artisans (is_active, archived_at);

-- ── 2. Category visibility / archive ─────────────────────────

alter table categories
  add column if not exists is_visible boolean not null default true,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_categories_public
  on categories (is_visible, archived_at, sort_order);

-- ── 3. artisan-media storage bucket ──────────────────────────
-- Public-read bucket; uploads/deletes only via service role
-- (server routes enforce staff auth). Mirrors the pattern used
-- for product-media / site-assets.

insert into storage.buckets (id, name, public)
values ('artisan-media', 'artisan-media', true)
on conflict (id) do nothing;

drop policy if exists "public read artisan media" on storage.objects;
create policy "public read artisan media"
  on storage.objects for select
  using (bucket_id = 'artisan-media');

-- No insert/update/delete policies for anon or authenticated:
-- only the service role (server) may mutate objects in this bucket.
