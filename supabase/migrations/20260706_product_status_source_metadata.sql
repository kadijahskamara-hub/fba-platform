-- ============================================================
-- Sprint 1a: Product archive/delete lifecycle + source metadata
-- Status model: existing `visibility` enum is kept.
--   Derived status: deleted_at → deleted | archived_at → archived
--   | visibility ('draft'/'published'/'hidden' == unpublished)
-- Public predicate everywhere:
--   visibility = 'published' AND archived_at IS NULL AND deleted_at IS NULL
-- ============================================================

alter table products
  -- lifecycle
  add column if not exists archived_at      timestamptz,
  add column if not exists archived_by      uuid references users(id) on delete set null,
  add column if not exists deleted_at       timestamptz,
  add column if not exists deleted_by       uuid references users(id) on delete set null,
  add column if not exists delete_reason    text,
  add column if not exists last_updated_by  uuid references users(id) on delete set null,
  -- content fields required by the site brief (§8–9)
  add column if not exists technical_description text,
  add column if not exists customisation_note    text,
  add column if not exists made_to_order          boolean not null default false,
  add column if not exists dispatch_time_label    text,
  add column if not exists lead_time_min_weeks    integer,
  add column if not exists lead_time_max_weeks    integer,
  add column if not exists min_order_quantity     integer,
  add column if not exists public_brand_visible   boolean not null default false,
  -- import source metadata (admin brief §4.4)
  add column if not exists source_type       text not null default 'manual'
    check (source_type in ('google_drive','google_sheet','csv','manual','brand_integration','other')),
  add column if not exists source_url        text,
  add column if not exists source_file_id    text,
  add column if not exists source_sheet_id   text,
  add column if not exists source_row_id     text,
  add column if not exists source_batch_id   uuid,  -- FK added in 20260706_import_audit_document_tables
  add column if not exists source_hash       text,
  add column if not exists last_imported_at  timestamptz,
  add column if not exists last_import_mode  text;

create index if not exists idx_products_archived_at    on products (archived_at) where archived_at is not null;
create index if not exists idx_products_deleted_at     on products (deleted_at)  where deleted_at is not null;
create index if not exists idx_products_source_batch   on products (source_batch_id);
create index if not exists idx_products_source_hash    on products (source_hash);
