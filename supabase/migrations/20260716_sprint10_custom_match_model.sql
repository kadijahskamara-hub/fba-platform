-- ============================================================
-- Sprint 10 — Custom Match/COM data model (16 Jul 2026)
--
-- Foundation for the product-page / finish-selection / Custom Match
-- build (Sprints 10–15). Entirely ADDITIVE: no existing table is
-- altered destructively; existing product_finishes/product_specifications
-- keep working until the admin + product page migrate onto these tables.
-- RLS is enabled with no policies (service-role access only), matching
-- the platform convention.
-- ============================================================

-- ── 1. Material types (backend-driven FINISH TYPE filter) ────
create table if not exists material_types (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table material_types enable row level security;

insert into material_types (name, slug, sort_order)
select v.name, v.slug, v.sort_order from (values
  ('Marble / Stone',      'marble-stone',      10),
  ('Timber',              'timber',            20),
  ('Fabric / Upholstery', 'fabric-upholstery', 30),
  ('Metal Finish',        'metal-finish',      40),
  ('Leather',             'leather',           50),
  ('Ceramic / Glaze',     'ceramic-glaze',     60),
  ('Rattan / Woven',      'rattan-woven',      70),
  ('Lacquer / Paint',     'lacquer-paint',     80),
  ('Glass',               'glass',             90),
  ('Resin',               'resin',            100),
  ('Composite',           'composite',        110),
  ('Other',               'other',            120)
) as v(name, slug, sort_order)
where not exists (select 1 from material_types m where m.slug = v.slug);

-- ── 2. Reusable finish library ───────────────────────────────
create table if not exists finishes (
  id                   uuid primary key default uuid_generate_v4(),
  material_type_id     uuid not null references material_types(id) on delete restrict,
  name                 text not null,
  code                 text,
  slug                 text not null unique,
  hex_colour           text,                       -- swatch FALLBACK only
  texture_storage_path text,                       -- product-media bucket
  origin               text,
  supplier             text,                       -- INTERNAL — never public
  supplier_reference   text,                       -- INTERNAL — never public
  description          text,
  technical_notes      text,
  sample_available     boolean not null default false,
  is_active            boolean not null default true,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_finishes_material_type on finishes (material_type_id) where is_active;
alter table finishes enable row level security;

-- ── 3. Product finish groups (tabs: Metal / Body / Tabletop …) ─
create table if not exists product_finish_groups (
  id               uuid primary key default uuid_generate_v4(),
  product_id       uuid not null references products(id) on delete cascade,
  label            text not null,
  key              text not null,                 -- stable key, e.g. 'tabletop'
  material_type_id uuid references material_types(id) on delete set null,
  required         boolean not null default false,
  help_text        text,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (product_id, key)
);
create index if not exists idx_pfg_product on product_finish_groups (product_id) where is_active;
alter table product_finish_groups enable row level security;

-- ── 4. Product finish options (a finish offered within a group) ─
create table if not exists product_finish_options (
  id                         uuid primary key default uuid_generate_v4(),
  finish_group_id            uuid not null references product_finish_groups(id) on delete cascade,
  finish_id                  uuid not null references finishes(id) on delete restrict,
  is_available               boolean not null default true,
  is_default                 boolean not null default false,
  price_adjustment           numeric not null default 0,   -- absolute, order currency
  lead_time_adjustment_weeks numeric not null default 0,
  sku_suffix                 text,
  description_override       text,
  sample_available           boolean,
  sort_order                 integer not null default 0,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (finish_group_id, finish_id)
);
create index if not exists idx_pfo_group on product_finish_options (finish_group_id);
alter table product_finish_options enable row level security;

-- ── 5. Compatibility rules (block invalid combinations) ─────
create table if not exists finish_compatibility_rules (
  id                      uuid primary key default uuid_generate_v4(),
  product_id              uuid not null references products(id) on delete cascade,
  source_finish_option_id uuid not null references product_finish_options(id) on delete cascade,
  target_finish_option_id uuid not null references product_finish_options(id) on delete cascade,
  is_allowed              boolean not null default false,  -- rules mostly FORBID
  explanation             text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  unique (source_finish_option_id, target_finish_option_id)
);
create index if not exists idx_fcr_product on finish_compatibility_rules (product_id) where is_active;
alter table finish_compatibility_rules enable row level security;

-- ── 6. Structured product media (replaces raw products.images) ─
create table if not exists product_media (
  id               uuid primary key default uuid_generate_v4(),
  product_id       uuid not null references products(id) on delete cascade,
  finish_option_id uuid references product_finish_options(id) on delete set null,
  storage_bucket   text not null default 'product-media',
  storage_path     text not null,
  media_role       text not null default 'gallery'
    check (media_role in ('primary','gallery','swatch','texture','lifestyle','dimension_drawing','tear_sheet_hero')),
  alt_text         text,
  caption          text,
  width            integer,
  height           integer,
  sort_order       integer not null default 0,
  is_primary       boolean not null default false,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_product_media_product on product_media (product_id, sort_order) where is_active;
create unique index if not exists uq_product_media_primary
  on product_media (product_id) where is_primary and is_active;
alter table product_media enable row level security;

-- ── 7. Generic admin-orderable specification rows ────────────
-- Complements the typed product_specifications row; used for arbitrary
-- label/value rows the admin can add, remove and reorder (md doc §14.8).
create table if not exists product_spec_rows (
  id         uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  label      text not null,
  value      text not null,
  unit       text,
  visibility text not null default 'public' check (visibility in ('public','trade','internal')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_spec_rows_product on product_spec_rows (product_id, sort_order);
alter table product_spec_rows enable row level security;

-- ── 8. Technical passport attributes (verified claims only) ──
create table if not exists product_passport_attributes (
  id                    uuid primary key default uuid_generate_v4(),
  product_id            uuid not null references products(id) on delete cascade,
  attribute_key         text not null,          -- e.g. 'crib5', 'eti', 'golden_sample', 'fsc'
  label                 text not null,          -- display text, e.g. 'Crib 5 Fire Retardant'
  value_text            text,                   -- optional detail (e.g. rub count)
  is_public             boolean not null default false,
  is_verified           boolean not null default false,
  verified_by           uuid references users(id) on delete set null,
  verified_at           timestamptz,
  expires_at            timestamptz,            -- claim hidden after expiry
  document_storage_path text,                   -- PRIVATE certificate (custom-match bucket)
  sort_order            integer not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (product_id, attribute_key)
);
create index if not exists idx_passport_product on product_passport_attributes (product_id) where is_active;
alter table product_passport_attributes enable row level security;

-- ── 9. Custom Match requests ─────────────────────────────────
create sequence if not exists custom_match_number_seq start 1;

create or replace function public.next_custom_match_number()
returns text
language sql
security definer
set search_path to 'public'
as $$
  select 'FBA-CM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('custom_match_number_seq')::text, 4, '0')
$$;
revoke all on function public.next_custom_match_number() from public, anon, authenticated;

create table if not exists custom_match_requests (
  id                        uuid primary key default uuid_generate_v4(),
  reference_number          text not null unique default public.next_custom_match_number(),
  -- links (all optional except product)
  product_id                uuid not null references products(id) on delete restrict,
  project_id                uuid references projects(id) on delete set null,
  project_item_id           uuid references project_items(id) on delete set null,
  quote_request_id          uuid references quote_requests(id) on delete set null,
  proforma_id               uuid references proformas(id) on delete set null,
  proforma_line_item_id     uuid references proforma_line_items(id) on delete set null,
  commercial_order_id       uuid references commercial_orders(id) on delete set null,
  requester_user_id         uuid references users(id) on delete set null,
  -- guest / requester contact (submitted values, never session-derived)
  requester_name            text not null,
  requester_studio          text,
  requester_email           text not null,
  requester_telephone       text,
  -- request payload
  quantity                  numeric not null default 1 check (quantity > 0),
  material_type_id          uuid references material_types(id) on delete set null,
  application_component     text,               -- e.g. 'tabletop', 'upholstery'
  supplier_brand            text,
  material_code             text,
  sample_batch_reference    text,
  requested_colour          text,
  gloss_level               text check (gloss_level in ('matt','satin','semi_gloss','full_gloss','custom_na')),
  grain_pattern_match       boolean not null default false,
  stain_tone_match          boolean not null default false,
  exact_batch_match         boolean not null default false,
  sheen_gloss_match         boolean not null default false,
  physical_sample_available boolean not null default false,
  physical_sample_status    text check (physical_sample_status in
    ('none','client_has_sample','sample_requested','sample_in_transit','sample_received','sample_sent_to_maker','sample_approved','sample_rejected')),
  sample_location           text,
  fire_requirement          text,               -- e.g. 'Crib 5'
  performance_requirement   text,               -- e.g. 'Martindale 40k'
  colour_tolerance          text,
  dimensions_application    jsonb not null default '{}'::jsonb,  -- material-specific fields (§11.3)
  selected_finishes_snapshot jsonb not null default '[]'::jsonb, -- standard selections at submit time
  additional_notes          text,
  -- workflow
  status                    text not null default 'submitted' check (status in
    ('draft','submitted','needs_information','under_fba_review','sent_to_maker','sample_required',
     'maker_feasible','maker_not_feasible','costing_required','client_approval_required',
     'approved','rejected','converted_to_quote','converted_to_order','closed')),
  assigned_to               uuid references users(id) on delete set null,
  maker_feasibility         text check (maker_feasibility in ('pending','feasible','not_feasible','feasible_with_conditions')),
  feasibility_notes         text,
  cost_adjustment           numeric,            -- INTERNAL until approved
  lead_time_adjustment_weeks numeric,
  client_approval_status    text not null default 'not_requested'
    check (client_approval_status in ('not_requested','requested','approved','rejected')),
  maker_approval_status     text not null default 'not_requested'
    check (maker_approval_status in ('not_requested','requested','approved','rejected')),
  internal_notes            text,
  source_page               text,
  submitted_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists idx_cmr_status on custom_match_requests (status);
create index if not exists idx_cmr_product on custom_match_requests (product_id);
create index if not exists idx_cmr_proforma on custom_match_requests (proforma_id) where proforma_id is not null;
create index if not exists idx_cmr_order on custom_match_requests (commercial_order_id) where commercial_order_id is not null;
alter table custom_match_requests enable row level security;

-- ── 10. Custom Match attachments (private bucket) ────────────
create table if not exists custom_match_attachments (
  id                      uuid primary key default uuid_generate_v4(),
  custom_match_request_id uuid not null references custom_match_requests(id) on delete cascade,
  storage_bucket          text not null default 'custom-match',
  storage_path            text not null,
  original_filename       text not null,
  mime_type               text not null,
  file_size               bigint not null,
  uploaded_by             uuid references users(id) on delete set null,
  visibility              text not null default 'internal' check (visibility in ('internal','client','maker')),
  created_at              timestamptz not null default now()
);
create index if not exists idx_cma_request on custom_match_attachments (custom_match_request_id);
alter table custom_match_attachments enable row level security;

-- ── 11. Finish-selection snapshots ───────────────────────────
-- A product saved twice with different configurations = two parent rows,
-- each with its own selection set. Labels/codes/adjustments are
-- SNAPSHOTS: later catalogue edits never rewrite history.
create table if not exists project_item_finish_selections (
  id                         uuid primary key default uuid_generate_v4(),
  project_item_id            uuid not null references project_items(id) on delete cascade,
  finish_group_id            uuid references product_finish_groups(id) on delete set null,
  finish_option_id           uuid references product_finish_options(id) on delete set null,
  finish_id                  uuid references finishes(id) on delete set null,
  group_key                  text,
  group_label                text not null,
  finish_label               text not null,
  finish_code                text,
  price_adjustment           numeric not null default 0,
  lead_time_adjustment_weeks numeric not null default 0,
  created_at                 timestamptz not null default now(),
  unique (project_item_id, finish_group_id)
);
create index if not exists idx_pifs_item on project_item_finish_selections (project_item_id);
alter table project_item_finish_selections enable row level security;

create table if not exists quote_item_finish_selections (
  id                         uuid primary key default uuid_generate_v4(),
  proforma_line_item_id      uuid not null references proforma_line_items(id) on delete cascade,
  finish_group_id            uuid references product_finish_groups(id) on delete set null,
  finish_option_id           uuid references product_finish_options(id) on delete set null,
  finish_id                  uuid references finishes(id) on delete set null,
  group_key                  text,
  group_label                text not null,
  finish_label               text not null,
  finish_code                text,
  price_adjustment           numeric not null default 0,
  lead_time_adjustment_weeks numeric not null default 0,
  created_at                 timestamptz not null default now(),
  unique (proforma_line_item_id, finish_group_id)
);
create index if not exists idx_qifs_item on quote_item_finish_selections (proforma_line_item_id);
alter table quote_item_finish_selections enable row level security;

-- Order-sheet selections deliberately deferred to Sprint 14: commercial
-- orders consume proforma lines, so the correct parent (PO line vs
-- invoice line vs order snapshot) is fixed there with real FKs.

-- ── 12. Quantity on project items (persisted through save-to-project) ─
alter table project_items add column if not exists room_area text;
alter table project_items add column if not exists configuration_complete boolean not null default true;
alter table project_items add column if not exists price_snapshot numeric;
alter table project_items add column if not exists currency_snapshot text;
alter table project_items add column if not exists lead_time_snapshot text;
alter table project_items add column if not exists product_snapshot jsonb;

-- ── 13. Storage buckets ──────────────────────────────────────
insert into storage.buckets (id, name, public)
select 'product-media', 'product-media', true
where not exists (select 1 from storage.buckets where id = 'product-media');

insert into storage.buckets (id, name, public)
select 'custom-match', 'custom-match', false
where not exists (select 1 from storage.buckets where id = 'custom-match');
