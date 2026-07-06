-- ============================================================
-- Sprint 1b: import_batches, import_batch_items, audit_logs,
-- product_documents, product_variants, product_finishes
-- + RLS on all new tables
-- + tightened public read policies (exclude archived/deleted)
-- ============================================================

-- ── Import batches ───────────────────────────────────────────
create table if not exists import_batches (
  id              uuid primary key default gen_random_uuid(),
  batch_ref       text unique not null,          -- e.g. IMP-2026-07-06-001
  source_type     text not null check (source_type in ('google_drive','google_sheet','csv','manual','brand_integration','other')),
  source_url      text,
  source_name     text,
  import_mode     text not null check (import_mode in ('create_only','upsert','force_refresh','replace_batch','purge_reload')),
  status          text not null default 'pending' check (status in ('pending','previewed','running','completed','completed_with_errors','failed','rolled_back','cancelled')),
  products_found  integer not null default 0,
  created_count   integer not null default 0,
  updated_count   integer not null default 0,
  unchanged_count integer not null default 0,
  skipped_count   integer not null default 0,
  conflict_count  integer not null default 0,
  archived_count  integer not null default 0,
  failed_count    integer not null default 0,
  imported_by     uuid references users(id) on delete set null,
  started_at      timestamptz,
  completed_at    timestamptz,
  error_summary   text,
  created_at      timestamptz not null default now()
);

create table if not exists import_batch_items (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references import_batches(id) on delete cascade,
  product_id        uuid references products(id) on delete set null,
  source_row_number integer,
  source_row_id     text,
  reference_code    text,
  sku               text,
  slug              text,
  product_name      text,
  action            text not null check (action in ('create','update','unchanged','skip','conflict','archive','fail')),
  status            text not null default 'done' check (status in ('pending','done','error')),
  message           text,   -- human-readable reason: never silently skip
  warning           text,
  error             text,
  before_snapshot   jsonb,  -- pre-import product state (rollback-lite)
  after_snapshot    jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_import_batch_items_batch   on import_batch_items (batch_id);
create index if not exists idx_import_batch_items_product on import_batch_items (product_id);

-- ── Audit logs ───────────────────────────────────────────────
create table if not exists audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references users(id) on delete set null,
  actor_email  text,
  action       text not null,           -- e.g. product.archived, product.deleted, import.completed
  entity_type  text not null,           -- e.g. product, import_batch, document
  entity_id    text,
  before_value jsonb,
  after_value  jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_audit_logs_entity  on audit_logs (entity_type, entity_id);
create index if not exists idx_audit_logs_created on audit_logs (created_at desc);

-- ── Product documents ────────────────────────────────────────
create table if not exists product_documents (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  document_type text not null check (document_type in (
    'product_specification','upholstery_program','material_finishes',
    'tear_sheet','technical_passport','care_maintenance','installation_guide','warranty')),
  label         text,
  url           text not null,
  file_name     text,
  file_size     bigint,
  mime_type     text,
  source_url    text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_product_documents_product on product_documents (product_id);

-- ── Product variants (sizes/dimensions) ──────────────────────
create table if not exists product_variants (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references products(id) on delete cascade,
  variant_name       text not null,        -- e.g. "245cm x 108cm"
  width              numeric,
  height             numeric,
  depth              numeric,
  diameter           numeric,
  seat_height        numeric,
  weight_kg          numeric,
  unit               text not null default 'cm',
  price_override       numeric,
  trade_price_override numeric,
  lead_time_override   text,
  availability       text not null default 'available' check (availability in ('available','unavailable','made_to_order')),
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_product_variants_product on product_variants (product_id);

-- ── Product finishes (hard finish + upholstery options) ──────
create table if not exists product_finishes (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id) on delete cascade,
  finish_category text not null check (finish_category in ('hard_finish','upholstery')),
  finish_name     text not null,
  finish_code     text,
  material        text,
  colour          text,
  swatch_url      text,
  com_accepted    boolean,
  rub_count       integer,
  fire_treatment  text,
  is_default      boolean not null default false,
  availability    text not null default 'available' check (availability in ('available','unavailable')),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_product_finishes_product on product_finishes (product_id);

-- ── FK from products.source_batch_id (column added in 1a) ────
do $$ begin
  alter table products
    add constraint fk_products_source_batch
    foreign key (source_batch_id) references import_batches(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- ── RLS ──────────────────────────────────────────────────────
alter table import_batches     enable row level security;
alter table import_batch_items enable row level security;
alter table audit_logs         enable row level security;
alter table product_documents  enable row level security;
alter table product_variants   enable row level security;
alter table product_finishes   enable row level security;

-- import/audit tables: NO policies — service-role access only.

-- public product sub-resources: readable only when parent product is publicly visible
drop policy if exists "public can read documents of published products" on product_documents;
create policy "public can read documents of published products" on product_documents
  for select using (
    exists (
      select 1 from products p
      where p.id = product_documents.product_id
        and p.visibility = 'published'
        and p.archived_at is null
        and p.deleted_at is null
    )
  );

drop policy if exists "public can read variants of published products" on product_variants;
create policy "public can read variants of published products" on product_variants
  for select using (
    exists (
      select 1 from products p
      where p.id = product_variants.product_id
        and p.visibility = 'published'
        and p.archived_at is null
        and p.deleted_at is null
    )
  );

drop policy if exists "public can read finishes of published products" on product_finishes;
create policy "public can read finishes of published products" on product_finishes
  for select using (
    exists (
      select 1 from products p
      where p.id = product_finishes.product_id
        and p.visibility = 'published'
        and p.archived_at is null
        and p.deleted_at is null
    )
  );

-- ── Tighten existing public read policies ────────────────────
drop policy if exists "public can read published products" on products;
create policy "public can read published products" on products
  for select using (
    visibility = 'published' and archived_at is null and deleted_at is null
  );

drop policy if exists "Anon can read specs for published products" on product_specifications;
create policy "Anon can read specs for published products" on product_specifications
  for select using (
    exists (
      select 1 from products p
      where p.id = product_specifications.product_id
        and p.visibility = 'published'
        and p.archived_at is null
        and p.deleted_at is null
    )
  );
