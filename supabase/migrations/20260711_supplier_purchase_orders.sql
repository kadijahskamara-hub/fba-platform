-- ============================================================
-- FBA Commercial Pipeline — Sprint 2: Supplier Purchase Orders
-- and Manufacturer Allocation
--
-- Runs after 20260711_commercial_foundation.sql (unmodified).
--
-- 1) Supplier capability on artisans (manufacturer identity)
-- 2) Supplier fields on products
-- 3) commercial_orders (sales-order boundary, FBA-SO numbering)
-- 4) supplier_allocations (line → manufacturer allocation layer)
-- 5) purchase_orders + purchase_order_lines
-- 6) purchase_order_snapshots (immutable issue snapshots)
-- 7) purchase_order_ack_tokens (hashed, expiring, revocable)
-- 8) Sequences + numbering functions (FBA-SO / FBA-PO)
-- 9) Procurement thresholds on commercial_settings
--
-- Non-destructive, idempotent, safe with existing data. No
-- historical allocations or supplier costs are fabricated.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Manufacturer (supplier) identity on artisans
--    The platform has a single maker entity: artisans. Sprint 2
--    extends it with supplier/ordering fields rather than adding
--    a parallel manufacturers table.
-- ─────────────────────────────────────────────────────────────

alter table artisans
  add column if not exists legal_name                  text,
  add column if not exists trading_name                text,
  add column if not exists primary_contact_name        text,
  add column if not exists order_email                 text,
  add column if not exists finance_email               text,
  add column if not exists telephone                   text,
  add column if not exists address                     text,
  add column if not exists country                     text,
  add column if not exists default_currency            text not null default 'GBP',
  add column if not exists default_payment_terms       text,
  add column if not exists default_lead_time           text,
  add column if not exists minimum_order_value         numeric,
  add column if not exists incoterms                   text,
  add column if not exists vat_or_tax_number           text,
  add column if not exists company_registration_number text,
  add column if not exists ordering_notes              text,
  add column if not exists delivery_notes              text;

-- ─────────────────────────────────────────────────────────────
-- 2. Supplier fields on products (supplier_cost already exists)
-- ─────────────────────────────────────────────────────────────

alter table products
  add column if not exists supplier_currency text,
  add column if not exists supplier_sku      text,
  add column if not exists min_order_qty     numeric,
  add column if not exists ordering_notes    text;

-- ─────────────────────────────────────────────────────────────
-- 3. Commercial orders (sales-order boundary)
-- ─────────────────────────────────────────────────────────────

create sequence if not exists sales_order_number_seq;

create or replace function public.next_sales_order_number()
returns text
language sql
security definer
set search_path to 'public'
as $$
  select 'FBA-SO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('sales_order_number_seq')::text, 4, '0')
$$;

create table if not exists commercial_orders (
  id                     uuid primary key default uuid_generate_v4(),
  order_number           text not null unique,
  source_proforma_id     uuid not null references proformas(id) on delete restrict,
  source_quote_number    text,
  source_revision_number integer not null default 1,
  client_id              uuid references users(id) on delete set null,
  project_id             uuid references projects(id) on delete set null,
  status                 text not null default 'accepted'
    check (status in ('draft','pending_acceptance','accepted','procurement_ready','partially_ordered','fully_ordered','in_progress','partially_delivered','completed','cancelled')),
  currency               text not null default 'GBP',
  client_snapshot        jsonb,
  project_snapshot       jsonb,
  commercial_snapshot    jsonb not null,   -- immutable conversion snapshot (lines + totals at conversion)
  duplicate_override_reason text,          -- Ultra Admin only; NULL enforces one order per source revision
  accepted_at            timestamptz,
  cancelled_at           timestamptz,
  cancel_reason          text,
  created_by             uuid references users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- One commercial order per accepted source revision, unless Ultra Admin
-- deliberately overrides with a recorded reason (override rows are
-- excluded from the uniqueness constraint).
create unique index if not exists uq_commercial_orders_source_revision
  on commercial_orders (source_proforma_id, source_revision_number)
  where duplicate_override_reason is null and status <> 'cancelled';

create index if not exists idx_commercial_orders_status on commercial_orders(status);
create index if not exists idx_commercial_orders_source on commercial_orders(source_proforma_id);

alter table commercial_orders enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 4. Supplier allocations (client line → manufacturer)
-- ─────────────────────────────────────────────────────────────

create table if not exists supplier_allocations (
  id                        uuid primary key default uuid_generate_v4(),
  commercial_order_id       uuid not null references commercial_orders(id) on delete cascade,
  source_line_item_id       uuid not null references proforma_line_items(id) on delete restrict,
  manufacturer_id           uuid not null references artisans(id) on delete restrict,
  supplier_product_id       uuid references products(id) on delete set null,
  supplier_sku              text,
  quantity                  numeric not null check (quantity > 0),
  unit_of_measure           text not null default 'each',
  supplier_currency         text,                 -- never fabricated; null = unknown, blocks PO
  supplier_cost_unit        numeric,              -- never fabricated; null = unknown, blocks PO
  supplier_cost_total       numeric,
  required_by_date          date,
  delivery_destination_type text not null default 'client_site'
    check (delivery_destination_type in ('client_site','fba_studio','warehouse','other')),
  delivery_address_snapshot text,
  specification_snapshot    jsonb,
  allocation_status         text not null default 'allocated'
    check (allocation_status in ('unallocated','allocated','ready_for_po','included_in_po','superseded','cancelled')),
  created_by                uuid references users(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists idx_supplier_allocations_order on supplier_allocations(commercial_order_id);
create index if not exists idx_supplier_allocations_manufacturer on supplier_allocations(manufacturer_id);
create index if not exists idx_supplier_allocations_status on supplier_allocations(allocation_status);
create index if not exists idx_supplier_allocations_source_line on supplier_allocations(source_line_item_id);

alter table supplier_allocations enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 5. Purchase orders + lines
-- ─────────────────────────────────────────────────────────────

create sequence if not exists purchase_order_number_seq;

create or replace function public.next_purchase_order_number()
returns text
language sql
security definer
set search_path to 'public'
as $$
  select 'FBA-PO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('purchase_order_number_seq')::text, 4, '0')
$$;

create table if not exists purchase_orders (
  id                         uuid primary key default uuid_generate_v4(),
  purchase_order_number      text not null unique,
  revision_number            integer not null default 1,
  commercial_order_id        uuid not null references commercial_orders(id) on delete restrict,
  manufacturer_id            uuid not null references artisans(id) on delete restrict,
  status                     text not null default 'draft'
    check (status in ('draft','pending_approval','approved','issued','viewed','acknowledged','supplier_amendment_requested','revised','confirmed','in_production','ready_for_dispatch','dispatched','partially_received','received','cancelled')),
  supplier_currency          text not null default 'GBP',
  order_date                 date,
  required_by_date           date,
  acknowledgement_due_date   date,
  supplier_contact_snapshot  jsonb,     -- manufacturer identity frozen at issue
  delivery_address_snapshot  text,
  payment_terms_snapshot     text,
  incoterms_snapshot         text,
  -- Supplier-side charges (major units; totals server-calculated)
  shipping_total             numeric not null default 0,
  packaging_total            numeric not null default 0,
  other_charges_total        numeric not null default 0,
  other_charges_description  text,
  discount_total             numeric not null default 0,
  subtotal                   numeric,
  tax_total                  numeric,
  grand_total                numeric,
  totals                     jsonb,     -- full server calculation cache
  internal_notes             text,
  supplier_notes             text,
  approval_status            text not null default 'none'
    check (approval_status in ('none','required','approved','blocked')),
  approval_reason            text,
  approval_requested_by      uuid references users(id) on delete set null,
  approved_by                uuid references users(id) on delete set null,
  approved_at                timestamptz,
  issued_by                  uuid references users(id) on delete set null,
  issued_at                  timestamptz,
  -- Margin-at-risk analysis (internal only; never in supplier output)
  margin_at_risk             boolean not null default false,
  margin_analysis            jsonb,
  margin_resolution          text
    check (margin_resolution is null or margin_resolution in ('accepted_internal_reduction','client_variation_required','supplier_negotiation_required','alternative_supplier_required','cancelled')),
  margin_resolution_note     text,
  -- Supplier acknowledgement
  acknowledged_by_name       text,
  acknowledged_by_email      text,
  acknowledged_at            timestamptz,
  acknowledgement_notes      text,
  expected_completion_date   date,
  -- Email preparation boundary (Sprint 5 will send; Sprint 2 prepares)
  supplier_recipient_email   text,
  cc_emails                  text[] not null default '{}',
  send_status                text not null default 'not_prepared'
    check (send_status in ('not_prepared','approved_not_sent','sent')),
  locked_at                  timestamptz,
  superseded_by_revision     integer,
  cancelled_at               timestamptz,
  cancel_reason              text,
  created_by                 uuid references users(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists idx_purchase_orders_manufacturer on purchase_orders(manufacturer_id);
create index if not exists idx_purchase_orders_commercial_order on purchase_orders(commercial_order_id);
create index if not exists idx_purchase_orders_status on purchase_orders(status);
create index if not exists idx_purchase_orders_issued_at on purchase_orders(issued_at);

alter table purchase_orders enable row level security;

create table if not exists purchase_order_lines (
  id                     uuid primary key default uuid_generate_v4(),
  purchase_order_id      uuid not null references purchase_orders(id) on delete cascade,
  supplier_allocation_id uuid references supplier_allocations(id) on delete set null,
  source_line_item_id    uuid references proforma_line_items(id) on delete set null,
  product_id             uuid references products(id) on delete set null,
  supplier_sku           text,
  fba_sku                text,
  product_name_snapshot  text not null,
  description_snapshot   text,
  specification_snapshot text,
  finish_snapshot        text,
  fabric_snapshot        text,
  dimensions_snapshot    text,
  image_snapshot         text,
  quantity               numeric not null check (quantity > 0),
  unit_of_measure        text not null default 'each',
  supplier_cost_unit     numeric not null check (supplier_cost_unit >= 0),
  cost_overridden        boolean not null default false,
  cost_override_reason   text,
  discount_amount        numeric not null default 0,
  tax_category           text not null default 'unknown'
    check (tax_category in ('standard','reduced','zero','exempt','outside_scope','reverse_charge','unknown')),
  tax_rate_snapshot      numeric,
  line_net_total         numeric,
  line_tax_total         numeric,
  line_gross_total       numeric,
  required_by_date       date,
  sort_order             integer not null default 0,
  internal_notes         text,
  supplier_notes         text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_po_lines_po on purchase_order_lines(purchase_order_id);
create index if not exists idx_po_lines_allocation on purchase_order_lines(supplier_allocation_id);

alter table purchase_order_lines enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 6. Immutable PO issue snapshots (one per issued revision)
-- ─────────────────────────────────────────────────────────────

create table if not exists purchase_order_snapshots (
  id                uuid primary key default uuid_generate_v4(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  revision          integer not null default 1,
  document_number   text not null,     -- e.g. FBA-PO-2026-0001-R02
  snapshot          jsonb not null,
  issued_by         uuid references users(id) on delete set null,
  issued_at         timestamptz not null default now(),
  unique (purchase_order_id, revision)
);

alter table purchase_order_snapshots enable row level security;

-- reject_mutation() was created in the Sprint 1 migration.
drop trigger if exists purchase_order_snapshots_immutable on purchase_order_snapshots;
create trigger purchase_order_snapshots_immutable
  before update or delete on purchase_order_snapshots
  for each row execute function public.reject_mutation();

create index if not exists idx_po_snapshots_po on purchase_order_snapshots(purchase_order_id);

-- ─────────────────────────────────────────────────────────────
-- 7. Supplier acknowledgement tokens (hashed, expiring, revocable)
-- ─────────────────────────────────────────────────────────────

create table if not exists purchase_order_ack_tokens (
  id                uuid primary key default uuid_generate_v4(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  revision          integer not null,
  token_hash        text not null unique,   -- sha-256 hex; raw token never stored
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  first_viewed_at   timestamptz,
  used_at           timestamptz,            -- set on acknowledge / amendment request
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_po_ack_tokens_po on purchase_order_ack_tokens(purchase_order_id);

alter table purchase_order_ack_tokens enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 8. Procurement thresholds (configurable, not hard-coded)
-- ─────────────────────────────────────────────────────────────

alter table commercial_settings
  add column if not exists po_value_approval_threshold   numeric,             -- PO grand total above this → approval (null = disabled)
  add column if not exists po_freight_approval_threshold numeric,             -- shipping+packaging above this → approval (null = disabled)
  add column if not exists default_acknowledgement_days  integer not null default 5;
