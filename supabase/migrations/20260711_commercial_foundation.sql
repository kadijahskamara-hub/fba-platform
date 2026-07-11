-- ============================================================
-- FBA Commercial Pipeline — Sprint 1: Commercial foundation
--
-- 1) Baseline reconciliation: guarded creation of the proforma
--    tables whose original migration is missing from the repo
--    (they exist in the live database; IF NOT EXISTS makes this
--    a no-op there and a correct baseline on fresh databases).
-- 2) commercial_settings (protected financial configuration)
-- 3) commercial_setting_changes (immutable change log)
-- 4) service_catalogue (+ seed data)
-- 5) proformas → commercial document header fields
-- 6) proforma_line_items → cost/selling/tax/discount fields
-- 7) issued_documents (frozen snapshots per issue event)
-- 8) Quote numbering sequence + function
-- 9) users.is_ultra_admin + granular permission backfill
--
-- All statements are idempotent and non-destructive.
-- No existing data is modified except explicit, safe backfills.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Baseline reconciliation for missing proforma migrations
-- ─────────────────────────────────────────────────────────────

create sequence if not exists proforma_number_seq;
create sequence if not exists invoice_number_seq;

create table if not exists proformas (
  id               uuid primary key default uuid_generate_v4(),
  proforma_number  text not null default ('FBA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('proforma_number_seq')::text, 4, '0')),
  quote_request_id uuid references quote_requests(id) on delete set null,
  contact_user_id  uuid references users(id) on delete set null,
  client_name      text,
  client_email     text,
  client_company   text,
  project_name     text,
  project_location text,
  currency         text not null default 'GBP',
  stage            text not null default 'draft',
  lost_reason      text,
  notes            text,
  admin_notes      text,
  valid_until      date,
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  vat_rate         numeric not null default 20,
  deposit_percent  numeric not null default 50,
  lead_time        text,
  delivery_notes   text,
  payment_terms    text,
  invoice_number   text,
  invoice_date     date,
  invoice_due_date date
);

create table if not exists proforma_line_items (
  id               uuid primary key default uuid_generate_v4(),
  proforma_id      uuid not null references proformas(id) on delete cascade,
  product_id       uuid references products(id) on delete set null,
  is_bespoke       boolean not null default false,
  name             text not null,
  description      text,
  manufacturer_id  uuid references artisans(id) on delete set null,
  manufacturer_name text,
  quantity         numeric not null default 1,
  unit_price       numeric,
  currency         text not null default 'GBP',
  selected_finish  text,
  selected_fabric  text,
  selected_size    text,
  notes            text,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  section          text,
  spec_details     text,
  image_url        text
);

create table if not exists proforma_downloads (
  id                uuid primary key default uuid_generate_v4(),
  proforma_id       uuid not null references proformas(id) on delete cascade,
  audience          text not null,
  manufacturer_id   uuid references artisans(id) on delete set null,
  manufacturer_name text,
  recipient_email   text,
  note              text,
  downloaded_by     uuid references users(id) on delete set null,
  downloaded_at     timestamptz not null default now(),
  doc_type          text not null default 'proforma'
);

create or replace function public.next_invoice_number()
returns text
language sql
security definer
set search_path to 'public'
as $$
  select 'FBA-INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 4, '0')
$$;

alter table proformas           enable row level security;
alter table proforma_line_items enable row level security;
alter table proforma_downloads  enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 2. Commercial settings (single protected row)
-- ─────────────────────────────────────────────────────────────

create table if not exists commercial_settings (
  id                          uuid primary key default uuid_generate_v4(),
  singleton                   boolean not null default true unique check (singleton),
  pricing_method_default      text not null default 'markup' check (pricing_method_default in ('markup','margin')),
  vat_registered              boolean not null default true,
  vat_number                  text,
  default_vat_rate            numeric not null default 20 check (default_vat_rate >= 0 and default_vat_rate <= 100),
  default_tax_category        text not null default 'standard' check (default_tax_category in ('standard','reduced','zero','exempt','outside_scope')),
  default_deposit_percent     numeric not null default 50 check (default_deposit_percent >= 0 and default_deposit_percent <= 100),
  deposit_value_rules         jsonb not null default '[]'::jsonb,  -- [{min_order_value, deposit_percent}]
  default_quote_expiry_days   integer not null default 30 check (default_quote_expiry_days > 0),
  default_currency            text not null default 'GBP',
  default_payment_terms       text,
  default_lead_time           text,
  procurement_fee_type        text not null default 'none' check (procurement_fee_type in ('percentage','fixed','tiered','none')),
  procurement_fee_basis       text not null default 'product_selling_subtotal' check (procurement_fee_basis in ('product_selling_subtotal','product_cost_subtotal','approved_procurement_value','selected_lines','manual_base_amount')),
  procurement_fee_value       numeric not null default 0 check (procurement_fee_value >= 0),
  procurement_fee_tiers       jsonb not null default '[]'::jsonb,  -- [{up_to, value}] for tiered fees
  approval_thresholds         jsonb not null default '{
    "margin_commercial_below": 30,
    "margin_ultra_below": 20,
    "discount_commercial_above": 10,
    "discount_ultra_above": 20,
    "negative_margin": "blocked_ultra_approval"
  }'::jsonb,
  company_legal_name          text not null default 'Full Bloom Artelier',
  company_registration_number text,
  registered_address          text,
  invoice_email               text not null default 'info@fullbloom.uk.com',
  invoice_phone               text,
  bank_name                   text,
  bank_account_name           text,
  bank_account_number         text,
  bank_sort_code              text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid references users(id) on delete set null
);

alter table commercial_settings enable row level security;

-- Seed the singleton row, carrying forward values from the legacy
-- site_settings.document_settings blob where present. Placeholder
-- strings like "[Bank name]" are not copied.
insert into commercial_settings (singleton)
select true
where not exists (select 1 from commercial_settings);

do $$
declare
  doc jsonb;
begin
  select value into doc from site_settings where key = 'document_settings';
  if doc is not null then
    update commercial_settings set
      vat_number = coalesce(nullif(nullif(doc->>'vat_number',''), '[VAT No.]'), vat_number),
      company_registration_number = coalesce(nullif(nullif(doc->>'company_number',''), '[Company No.]'), company_registration_number),
      registered_address = coalesce(nullif(nullif(doc->>'address',''), '[Registered address]'), registered_address),
      invoice_email = coalesce(nullif(doc->>'email',''), invoice_email),
      invoice_phone = coalesce(nullif(nullif(doc->>'phone',''), '[Phone number]'), invoice_phone),
      bank_name = coalesce(nullif(nullif(doc->>'bank_name',''), '[Bank name]'), bank_name),
      bank_account_number = coalesce(nullif(nullif(doc->>'bank_account',''), '[Account number]'), bank_account_number),
      bank_sort_code = coalesce(nullif(nullif(doc->>'bank_sort_code',''), '[Sort code]'), bank_sort_code),
      default_payment_terms = coalesce(nullif(doc->>'payment_terms',''), default_payment_terms),
      default_lead_time = coalesce(nullif(doc->>'default_lead_time',''), default_lead_time)
    where bank_name is null; -- only on first migration run
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3. Immutable commercial-setting change log
-- ─────────────────────────────────────────────────────────────

create table if not exists commercial_setting_changes (
  id                   uuid primary key default uuid_generate_v4(),
  setting_group        text not null,           -- e.g. 'bank_details','vat_identity','pricing_defaults'
  changed_fields       text[] not null,
  before_value         jsonb,                   -- sensitive values stored masked
  after_value          jsonb,                   -- sensitive values stored masked
  reason               text,
  actor_user_id        uuid references users(id) on delete set null,
  actor_email_snapshot text,
  request_metadata     jsonb,
  created_at           timestamptz not null default now()
);

alter table commercial_setting_changes enable row level security;

-- Immutability: block UPDATE/DELETE at the database level even for
-- accidental service-role statements.
create or replace function public.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'commercial_setting_changes is append-only';
end $$;

drop trigger if exists commercial_setting_changes_immutable on commercial_setting_changes;
create trigger commercial_setting_changes_immutable
  before update or delete on commercial_setting_changes
  for each row execute function public.reject_mutation();

-- ─────────────────────────────────────────────────────────────
-- 4. Service catalogue
-- ─────────────────────────────────────────────────────────────

create table if not exists service_catalogue (
  id                   uuid primary key default uuid_generate_v4(),
  code                 text not null unique,
  name                 text not null,
  description          text,
  pricing_type         text not null default 'fixed' check (pricing_type in ('fixed','hourly','daily','percentage','quantity','manual')),
  default_rate         numeric,
  default_unit         text,
  default_tax_category text not null default 'standard' check (default_tax_category in ('standard','reduced','zero','exempt','outside_scope')),
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table service_catalogue enable row level security;

insert into service_catalogue (code, name, description, pricing_type, default_unit) values
  ('INT-DESIGN',   'Interior Design',            'Concept development, spatial planning, and design direction.', 'fixed',      'stage'),
  ('FFE-SPEC',     'FF&E Specification',         'Furniture, fixtures and equipment specification and schedules.', 'fixed',    'stage'),
  ('PROC-MGMT',    'Procurement Management',     'Supplier and maker liaison, order placement, tracking, and delivery coordination.', 'percentage', '% of approved budget'),
  ('PROJ-COORD',   'Project Coordination',       'Programme management and stakeholder coordination.',            'daily',     'day'),
  ('INST-COORD',   'Installation Coordination',  'Site installation planning and supervision.',                   'daily',     'day'),
  ('DES-CONSULT',  'Design Consultation',        'Advisory design consultation.',                                 'hourly',    'hour'),
  ('BESPOKE-SRC',  'Bespoke Sourcing',           'Sourcing of bespoke and hard-to-find pieces.',                  'manual',    null),
  ('DELIVERY',     'Delivery / Installation',    'Delivery, placement, and installation of goods.',               'quantity',  'each')
on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 5. Commercial document header fields on proformas
-- ─────────────────────────────────────────────────────────────

create sequence if not exists quote_number_seq;

create or replace function public.next_quote_number()
returns text
language sql
security definer
set search_path to 'public'
as $$
  select 'FBA-Q-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('quote_number_seq')::text, 4, '0')
$$;

alter table proformas
  add column if not exists quote_number             text unique,
  add column if not exists revision_number          integer not null default 1,
  add column if not exists document_status          text not null default 'draft',
  add column if not exists pricing_method           text not null default 'markup',
  add column if not exists default_tax_category     text not null default 'standard',
  add column if not exists quote_date               date not null default current_date,
  add column if not exists billing_address          text,
  add column if not exists delivery_address         text,
  add column if not exists project_id               uuid references projects(id) on delete set null,
  add column if not exists deposit_basis            text not null default 'gross_total',
  add column if not exists deposit_override_reason  text,
  add column if not exists procurement_fee_type     text,
  add column if not exists procurement_fee_basis    text,
  add column if not exists procurement_fee_value    numeric,
  add column if not exists procurement_fee_manual_base numeric,
  add column if not exists procurement_fee_override numeric,
  add column if not exists procurement_fee_override_reason text,
  add column if not exists approval_status          text not null default 'none',
  add column if not exists approval_reason          text,
  add column if not exists approved_by              uuid references users(id) on delete set null,
  add column if not exists approved_at              timestamptz,
  add column if not exists issued_by                uuid references users(id) on delete set null,
  add column if not exists issued_at                timestamptz,
  add column if not exists locked_at                timestamptz,
  add column if not exists superseded_by_revision   integer,
  add column if not exists payments_received        numeric not null default 0,
  add column if not exists totals                   jsonb,
  add column if not exists settings_snapshot        jsonb;

-- Guarded CHECK constraints (ALTER TABLE ... ADD CONSTRAINT is not
-- idempotent, so wrap them).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'proformas_document_status_check') then
    alter table proformas add constraint proformas_document_status_check
      check (document_status in ('draft','pending_approval','approved','issued','cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'proformas_pricing_method_check') then
    alter table proformas add constraint proformas_pricing_method_check
      check (pricing_method in ('markup','margin'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'proformas_default_tax_category_check') then
    alter table proformas add constraint proformas_default_tax_category_check
      check (default_tax_category in ('standard','reduced','zero','exempt','outside_scope'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'proformas_approval_status_check') then
    alter table proformas add constraint proformas_approval_status_check
      check (approval_status in ('none','required_commercial','required_ultra','approved','blocked'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'proformas_deposit_basis_check') then
    alter table proformas add constraint proformas_deposit_basis_check
      check (deposit_basis in ('gross_total','net_subtotal'));
  end if;
end $$;

create index if not exists idx_proformas_document_status on proformas(document_status);
create index if not exists idx_proformas_project_id on proformas(project_id);

-- ─────────────────────────────────────────────────────────────
-- 6. Line item commercial fields
-- ─────────────────────────────────────────────────────────────

alter table proforma_line_items
  add column if not exists line_type                text not null default 'product',
  add column if not exists service_catalogue_id     uuid references service_catalogue(id) on delete set null,
  add column if not exists supplier_sku             text,
  add column if not exists fba_sku                  text,
  add column if not exists unit_of_measure          text not null default 'each',
  add column if not exists supplier_cost_unit       numeric,
  add column if not exists supplier_cost_source     text not null default 'unavailable',
  add column if not exists supplier_cost_overridden boolean not null default false,
  add column if not exists supplier_cost_override_reason text,
  add column if not exists pricing_method           text,
  add column if not exists pricing_percent          numeric,
  add column if not exists selling_price_unit       numeric,
  add column if not exists discount_type            text,
  add column if not exists discount_value           numeric,
  add column if not exists discount_amount          numeric,
  add column if not exists tax_category             text not null default 'standard',
  add column if not exists tax_rate_snapshot        numeric,
  add column if not exists line_cost_total          numeric,
  add column if not exists line_net_total           numeric,
  add column if not exists line_tax_total           numeric,
  add column if not exists line_gross_total         numeric,
  add column if not exists procurement_fee_eligible boolean not null default true,
  add column if not exists internal_notes           text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'proforma_line_items_line_type_check') then
    alter table proforma_line_items add constraint proforma_line_items_line_type_check
      check (line_type in ('product','service','fee','delivery','installation','adjustment'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'proforma_line_items_tax_category_check') then
    alter table proforma_line_items add constraint proforma_line_items_tax_category_check
      check (tax_category in ('standard','reduced','zero','exempt','outside_scope'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'proforma_line_items_pricing_method_check') then
    alter table proforma_line_items add constraint proforma_line_items_pricing_method_check
      check (pricing_method is null or pricing_method in ('markup','margin','manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'proforma_line_items_discount_type_check') then
    alter table proforma_line_items add constraint proforma_line_items_discount_type_check
      check (discount_type is null or discount_type in ('percent','fixed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'proforma_line_items_supplier_cost_source_check') then
    alter table proforma_line_items add constraint proforma_line_items_supplier_cost_source_check
      check (supplier_cost_source in ('manual','catalogue_trade','catalogue_supplier','unavailable'));
  end if;
end $$;

-- Backfill: legacy unit_price was the client-facing price, so it maps
-- to selling_price_unit. Cost is genuinely unknown for legacy lines —
-- it is marked 'unavailable' (never fabricated).
update proforma_line_items
  set selling_price_unit = unit_price,
      pricing_method = 'manual'
where selling_price_unit is null and unit_price is not null;

create index if not exists idx_proforma_line_items_service on proforma_line_items(service_catalogue_id);

-- ─────────────────────────────────────────────────────────────
-- 7. Issued document snapshots (immutable)
-- ─────────────────────────────────────────────────────────────

create table if not exists issued_documents (
  id              uuid primary key default uuid_generate_v4(),
  proforma_id     uuid not null references proformas(id) on delete cascade,
  doc_type        text not null check (doc_type in ('quote','proforma','invoice','service_invoice')),
  document_number text not null,
  revision        integer not null default 1,
  snapshot        jsonb not null,
  issued_by       uuid references users(id) on delete set null,
  issued_at       timestamptz not null default now(),
  unique (doc_type, document_number, revision)
);

alter table issued_documents enable row level security;

drop trigger if exists issued_documents_immutable on issued_documents;
create trigger issued_documents_immutable
  before update or delete on issued_documents
  for each row execute function public.reject_mutation();

create index if not exists idx_issued_documents_proforma on issued_documents(proforma_id);

alter table proforma_downloads
  add column if not exists issued_document_id uuid references issued_documents(id) on delete set null;

-- ─────────────────────────────────────────────────────────────
-- 8. Ultra Admin + granular permissions
-- ─────────────────────────────────────────────────────────────

alter table users add column if not exists is_ultra_admin boolean not null default false;

-- Designate the platform owner as the initial Ultra Admin so that
-- protected settings remain manageable. Any further change requires
-- an existing Ultra Admin (enforced in the API) or direct DB access.
update users set is_ultra_admin = true where email = 'admin@fullbloom.uk.com';

-- Backward-compatibility mapping: staff previously granted the broad
-- 'quote_pipeline' permission keep their working access as view/create/
-- edit, but do NOT receive pricing, approval, settings, or issue rights.
-- Idempotent: applies only to rows still missing the new keys.
update staff_permissions
set permissions = (
  select array(select distinct unnest(permissions || array['quote_pipeline_view','quote_create','quote_edit']))
), updated_at = now()
where 'quote_pipeline' = any(permissions)
  and not ('quote_pipeline_view' = any(permissions));
