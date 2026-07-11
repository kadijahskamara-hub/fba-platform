-- ============================================================
-- FBA / Full Bloom Artelier — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";


-- ── ENUMS ────────────────────────────────────────────────────────────────────

create type user_role as enum (
  'guest', 'retail_customer', 'trade_applicant',
  'trade_user', 'admin', 'staff'
);

create type user_status as enum (
  'active', 'pending', 'approved', 'declined', 'revoked', 'suspended', 'archived'
);

create type application_status as enum (
  'pending', 'form_sent', 'under_review', 'approved', 'declined', 'revoked'
);

create type product_visibility as enum ('draft', 'published', 'hidden');
create type product_audience  as enum ('retail', 'trade', 'retail_and_trade');
create type price_type        as enum ('fixed', 'price_on_request');
create type order_status      as enum (
  'pending', 'paid', 'processing', 'shipped', 'completed', 'cancelled', 'refunded'
);
create type quote_status      as enum (
  'new', 'reviewing', 'quoted', 'accepted', 'rejected', 'converted_to_order'
);
create type contact_type      as enum (
  'retail', 'trade', 'procurement', 'atelier', 'newsletter', 'general'
);
create type analytics_event   as enum (
  'view', 'save', 'quote_request', 'add_to_cart', 'purchase'
);
create type journal_status    as enum ('draft', 'published');
create type currency_code     as enum ('GBP', 'EUR', 'USD');


-- ── USERS ────────────────────────────────────────────────────────────────────

create table users (
  id            uuid primary key default uuid_generate_v4(),
  first_name    text not null,
  last_name     text not null,
  email         text not null unique,
  password_hash text not null,
  phone         text,
  role          user_role not null default 'retail_customer',
  status        user_status not null default 'active',
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  must_change_password boolean not null default false,
  -- Protected system-owner flag (Sprint 1 commercial). Never grantable
  -- through staff_permissions; API-enforced Ultra Admin capability.
  is_ultra_admin boolean not null default false
);

create index idx_users_email  on users(email);
create index idx_users_role   on users(role);
create index idx_users_status on users(status);


-- ── TRADE APPLICATIONS ───────────────────────────────────────────────────────

create table trade_applications (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid references users(id) on delete cascade,
  company_name          text not null,
  business_type         text not null,
  website               text,
  location              text,
  project_type          text,
  estimated_budget      text,
  how_did_you_hear      text,
  -- detailed form fields (sent in second step)
  vat_number            text,
  company_registration  text,
  trade_references      text,
  portfolio_url         text,
  annual_spend_estimate text,
  -- admin workflow
  status                application_status not null default 'pending',
  admin_notes           text,
  detailed_form_sent_at timestamptz,
  reviewed_at           timestamptz,
  reviewed_by           uuid references users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_trade_apps_user_id on trade_applications(user_id);
create index idx_trade_apps_status  on trade_applications(status);


-- ── CATEGORIES ───────────────────────────────────────────────────────────────

create table categories (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  description text,
  sort_order  integer default 0,
  created_at  timestamptz not null default now()
);

create table subcategories (
  id          uuid primary key default uuid_generate_v4(),
  category_id uuid not null references categories(id) on delete cascade,
  name        text not null,
  slug        text not null,
  sort_order  integer default 0,
  created_at  timestamptz not null default now(),
  unique(category_id, slug)
);

create index idx_subcats_category on subcategories(category_id);

-- Seed initial categories
insert into categories (name, slug, sort_order) values
  ('Lighting',     'lighting',     1),
  ('Tables',       'tables',       2),
  ('Seating',      'seating',      3),
  ('Textiles',     'textiles',     4),
  ('Surfaces',     'surfaces',     5),
  ('Accessories',  'accessories',  6),
  ('FBA Collection','fba-collection',7);

-- Seed subcategories
with cat as (select id, slug from categories)
insert into subcategories (category_id, name, slug, sort_order)
select c.id, sub.name, sub.slug, sub.sort_order from cat c
join (values
  ('lighting',      'Floor Lamp',       'floor-lamp',       1),
  ('lighting',      'Table Lamp',       'table-lamp',       2),
  ('lighting',      'Pendant',          'pendant',          3),
  ('lighting',      'Chandelier',       'chandelier',       4),
  ('lighting',      'Wall Light',       'wall-light',       5),
  ('tables',        'Dining Table',     'dining-table',     1),
  ('tables',        'Coffee Table',     'coffee-table',     2),
  ('tables',        'Side Table',       'side-table',       3),
  ('tables',        'Console Table',    'console-table',    4),
  ('seating',       'Dining Chair',     'dining-chair',     1),
  ('seating',       'Lounge Chair',     'lounge-chair',     2),
  ('seating',       'Sofa',             'sofa',             3),
  ('seating',       'Bench',            'bench',            4),
  ('seating',       'Stool',            'stool',            5),
  ('textiles',      'Cushions',         'cushions',         1),
  ('textiles',      'Rugs',             'rugs',             2),
  ('textiles',      'Throws',           'throws',           3),
  ('textiles',      'Fabrics',          'fabrics',          4),
  ('surfaces',      'Stone',            'stone',            1),
  ('surfaces',      'Tile',             'tile',             2),
  ('surfaces',      'Wall Finishes',    'wall-finishes',    3),
  ('surfaces',      'Specialist Finishes','specialist-finishes',4),
  ('accessories',   'Vessels',          'vessels',          1),
  ('accessories',   'Mirrors',          'mirrors',          2),
  ('accessories',   'Objects',          'objects',          3),
  ('accessories',   'Decorative Pieces','decorative-pieces',4),
  ('fba-collection','Retail Pieces',    'retail-pieces',    1),
  ('fba-collection','Trade Pieces',     'trade-pieces',     2),
  ('fba-collection','Limited Edition',  'limited-edition',  3)
) as sub(cat_slug, name, slug, sort_order) on c.slug = sub.cat_slug;


-- ── ARTISANS ─────────────────────────────────────────────────────────────────

create table artisans (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  slug            text not null unique,
  location        text,
  country_code    text,
  bio             text not null,
  craft_category  text,
  hero_image      text,
  gallery_images  text[] default '{}',
  is_published    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);


-- ── PRODUCTS ─────────────────────────────────────────────────────────────────

create table products (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null,
  slug              text not null unique,
  sku               text,
  reference_code    text,
  category_id       uuid references categories(id),
  subcategory_id    uuid references subcategories(id),
  artisan_id        uuid references artisans(id),
  description       text not null,
  short_description text,
  -- pricing
  retail_price      numeric(10,2),
  trade_price       numeric(10,2),
  supplier_cost     numeric(10,2),
  price_type        price_type not null default 'fixed',
  currency          currency_code not null default 'GBP',
  -- visibility
  visibility        product_visibility not null default 'draft',
  audience          product_audience not null default 'retail_and_trade',
  is_fba_collection boolean not null default false,
  -- logistics
  lead_time         text,
  shipping_origin   text,
  shipping_notes    text,
  -- images
  images            text[] default '{}',
  -- seo
  seo_title         text,
  seo_description   text,
  -- metadata
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_products_slug         on products(slug);
create index idx_products_category     on products(category_id);
create index idx_products_subcategory  on products(subcategory_id);
create index idx_products_artisan      on products(artisan_id);
create index idx_products_visibility   on products(visibility);
create index idx_products_audience     on products(audience);


-- ── PRODUCT SPECIFICATIONS ───────────────────────────────────────────────────

create table product_specifications (
  id                  uuid primary key default uuid_generate_v4(),
  product_id          uuid not null unique references products(id) on delete cascade,
  -- dimensions
  dimensions_summary  text,
  width_mm            numeric(8,1),
  depth_mm            numeric(8,1),
  height_mm           numeric(8,1),
  seat_height_mm      numeric(8,1),
  diameter_mm         numeric(8,1),
  weight_kg           numeric(8,2),
  -- material
  material            text,
  finish              text,
  fabric              text,
  com_available       boolean default false,
  care_instructions   text,
  technical_notes     text,
  -- lighting specific
  bulb_type           text,
  wattage             text,
  voltage             text,
  plug_type           text,
  cable_length        text,
  dimmable            boolean,
  ip_rating           text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);


-- ── PRODUCT OPTIONS (variants/finishes) ──────────────────────────────────────

create table product_option_groups (
  id         uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  name       text not null,
  sort_order integer default 0
);

create table product_option_values (
  id              uuid primary key default uuid_generate_v4(),
  option_group_id uuid not null references product_option_groups(id) on delete cascade,
  value           text not null,
  price_modifier  numeric(10,2) default 0,
  sort_order      integer default 0
);


-- ── PROJECTS (save-to-project folders) ───────────────────────────────────────

create table projects (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references users(id) on delete cascade,
  name       text not null,
  location   text,
  budget     numeric(12,2),
  currency   currency_code default 'GBP',
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_projects_user on projects(user_id);

create table project_items (
  id         uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity   integer not null default 1,
  notes      text,
  created_at timestamptz not null default now(),
  unique(project_id, product_id)
);


-- ── CART ─────────────────────────────────────────────────────────────────────

create table cart_items (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity   integer not null default 1,
  created_at timestamptz not null default now(),
  unique(user_id, product_id)
);


-- ── RETAIL ORDERS ────────────────────────────────────────────────────────────

create table retail_orders (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid references users(id),
  order_number   text not null unique,
  status         order_status not null default 'pending',
  total_amount   numeric(12,2) not null,
  currency       currency_code not null default 'GBP',
  shipping_name  text,
  shipping_addr  text,
  stripe_pi_id   text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table retail_order_items (
  id            uuid primary key default uuid_generate_v4(),
  order_id      uuid not null references retail_orders(id) on delete cascade,
  product_id    uuid references products(id),
  product_name  text not null,
  quantity      integer not null,
  unit_price    numeric(10,2) not null,
  total_price   numeric(10,2) not null
);


-- ── QUOTE REQUESTS ───────────────────────────────────────────────────────────

create table quote_requests (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid references users(id),
  project_id        uuid references projects(id),
  project_name      text,
  project_location  text,
  budget            numeric(12,2),
  required_by       date,
  status            quote_status not null default 'new',
  notes             text,
  admin_notes       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table quote_request_items (
  id               uuid primary key default uuid_generate_v4(),
  quote_request_id uuid not null references quote_requests(id) on delete cascade,
  product_id       uuid references products(id),
  product_name     text not null,
  quantity         integer not null default 1,
  notes            text
);


-- ── CONTACTS (all web enquiries stored here) ─────────────────────────────────

create table contacts (
  id                uuid primary key default uuid_generate_v4(),
  first_name        text,
  last_name         text,
  email             text not null,
  phone             text,
  company_name      text,
  contact_type      contact_type not null default 'general',
  source            text not null,
  consent_marketing boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now()
);

create index idx_contacts_email        on contacts(email);
create index idx_contacts_contact_type on contacts(contact_type);
create index idx_contacts_created_at   on contacts(created_at desc);


-- ── SERVICE ENQUIRIES ────────────────────────────────────────────────────────

create table service_enquiries (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null,
  email             text not null,
  phone             text,
  company_name      text,
  enquiry_types     text[] not null default '{}',
  project_name      text,
  project_location  text,
  budget_range      text,
  timeline          text,
  message           text,
  created_at        timestamptz not null default now()
);


-- ── PRODUCT ANALYTICS ────────────────────────────────────────────────────────

create table product_analytics_events (
  id         uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  user_id    uuid references users(id),
  event_type analytics_event not null,
  session_id text,
  created_at timestamptz not null default now()
);

create index idx_analytics_product   on product_analytics_events(product_id);
create index idx_analytics_event     on product_analytics_events(event_type);
create index idx_analytics_created   on product_analytics_events(created_at desc);


-- ── JOURNAL POSTS ────────────────────────────────────────────────────────────

create table journal_posts (
  id             uuid primary key default uuid_generate_v4(),
  title          text not null,
  slug           text not null unique,
  excerpt        text,
  content        text not null,
  featured_image text,
  category       text,
  tags           text[] default '{}',
  seo_title      text,
  seo_description text,
  status         journal_status not null default 'draft',
  author_id      uuid references users(id),
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_journal_status     on journal_posts(status);
create index idx_journal_published  on journal_posts(published_at desc);
create index idx_journal_slug       on journal_posts(slug);


-- ── STAFF PERMISSIONS ────────────────────────────────────────────────────────

create table staff_permissions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null unique references users(id) on delete cascade,
  permissions text[] not null default '{}',
  -- available permissions: dashboard, trade_applications, products,
  --   artisans, retail_orders, commercial_orders, quote_pipeline,
  --   journals, settings, users, contacts
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- ── REGION SETTINGS ──────────────────────────────────────────────────────────

create table region_settings (
  id               uuid primary key default uuid_generate_v4(),
  country_code     text not null unique,
  country_name     text not null,
  currency         currency_code not null default 'GBP',
  language         text,
  shipping_message text,
  default_lead_time text,
  is_active        boolean not null default true
);

insert into region_settings (country_code, country_name, currency, language, shipping_message) values
  ('GB', 'United Kingdom',  'GBP', 'en', 'Delivery within mainland UK included. Islands and remote areas may incur additional charges.'),
  ('US', 'United States',   'USD', 'en', 'International shipping via DHL Express. Duties and customs not included.'),
  ('DE', 'Germany',         'EUR', 'de', 'Versand innerhalb der EU inklusive Zollabwicklung.'),
  ('FR', 'France',          'EUR', 'fr', 'Livraison dans toute l''UE. Droits de douane non inclus.'),
  ('IT', 'Italy',           'EUR', 'it', 'Spedizione in tutta l''UE inclusa.'),
  ('AE', 'UAE',             'USD', 'en', 'International shipping via DHL. Duties and import taxes may apply.');


-- ── UPDATED_AT TRIGGERS ──────────────────────────────────────────────────────

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_updated_at
  before update on users for each row execute function update_updated_at();
create trigger trg_trade_apps_updated_at
  before update on trade_applications for each row execute function update_updated_at();
create trigger trg_products_updated_at
  before update on products for each row execute function update_updated_at();
create trigger trg_artisans_updated_at
  before update on artisans for each row execute function update_updated_at();
create trigger trg_projects_updated_at
  before update on projects for each row execute function update_updated_at();
create trigger trg_journal_updated_at
  before update on journal_posts for each row execute function update_updated_at();
create trigger trg_retail_orders_updated_at
  before update on retail_orders for each row execute function update_updated_at();
create trigger trg_quote_requests_updated_at
  before update on quote_requests for each row execute function update_updated_at();


-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
-- NOTE: RLS is enforced at the Supabase layer.
-- The app uses server-side service_role key for admin operations
-- and anon key for public read operations on published products.

-- Published products are publicly readable
alter table products enable row level security;
create policy "public can read published products"
  on products for select
  using (visibility = 'published');

-- Journal posts: published posts readable by all
alter table journal_posts enable row level security;
create policy "public can read published journal posts"
  on journal_posts for select
  using (status = 'published');

-- Categories/subcategories are publicly readable
alter table categories enable row level security;
create policy "public can read categories"
  on categories for select using (true);

alter table subcategories enable row level security;
create policy "public can read subcategories"
  on subcategories for select using (true);

-- Artisans: published profiles readable by all
alter table artisans enable row level security;
create policy "public can read published artisans"
  on artisans for select
  using (is_published = true);

-- Everything else uses service_role (server-side only)


-- ═════════════════════════════════════════════════════════════════════════════
-- COMMERCIAL PIPELINE (Sprint 1, 2026-07)
-- Canonical definitions matching migration 20260711_commercial_foundation.sql
-- (which also baselines the proforma tables whose original creation
-- migration predated the repository).
-- ═════════════════════════════════════════════════════════════════════════════

-- ── PROFORMAS: commercial working document (quote → pro forma → invoice) ─────

create sequence if not exists proforma_number_seq;
create sequence if not exists invoice_number_seq;
create sequence if not exists quote_number_seq;

-- ── SERVICE CATALOGUE ────────────────────────────────────────────────────────

create table service_catalogue (
  id                   uuid primary key default uuid_generate_v4(),
  code                 text not null unique,
  name                 text not null,
  description          text,
  pricing_type         text not null default 'fixed'
    check (pricing_type in ('fixed','hourly','daily','percentage','quantity','manual')),
  default_rate         numeric,
  default_unit         text,
  default_tax_category text not null default 'standard'
    check (default_tax_category in ('standard','reduced','zero','exempt','outside_scope')),
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table proformas (
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
  stage            text not null default 'draft',          -- pipeline stage (Phase 2)
  lost_reason      text,
  notes            text,                                    -- client-facing notes
  admin_notes      text,                                    -- internal notes
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
  invoice_due_date date,
  -- Sprint 1 commercial header
  quote_number             text unique,
  revision_number          integer not null default 1,
  document_status          text not null default 'draft'
    check (document_status in ('draft','pending_approval','approved','issued','cancelled')),
  pricing_method           text not null default 'markup' check (pricing_method in ('markup','margin')),
  default_tax_category     text not null default 'standard'
    check (default_tax_category in ('standard','reduced','zero','exempt','outside_scope')),
  quote_date               date not null default current_date,
  billing_address          text,
  delivery_address         text,
  project_id               uuid references projects(id) on delete set null,
  deposit_basis            text not null default 'gross_total' check (deposit_basis in ('gross_total','net_subtotal')),
  deposit_override_reason  text,
  procurement_fee_type     text,
  procurement_fee_basis    text,
  procurement_fee_value    numeric,
  procurement_fee_manual_base numeric,
  procurement_fee_override numeric,
  procurement_fee_override_reason text,
  approval_status          text not null default 'none'
    check (approval_status in ('none','required_commercial','required_ultra','approved','blocked')),
  approval_reason          text,
  approved_by              uuid references users(id) on delete set null,
  approved_at              timestamptz,
  issued_by                uuid references users(id) on delete set null,
  issued_at                timestamptz,
  locked_at                timestamptz,                     -- set on issue; blocks edits
  superseded_by_revision   integer,
  payments_received        numeric not null default 0,
  totals                   jsonb,                           -- server-calculated cache
  settings_snapshot        jsonb
);

create index idx_proformas_document_status on proformas(document_status);
create index idx_proformas_project_id on proformas(project_id);

create table proforma_line_items (
  id               uuid primary key default uuid_generate_v4(),
  proforma_id      uuid not null references proformas(id) on delete cascade,
  product_id       uuid references products(id) on delete set null,
  is_bespoke       boolean not null default false,
  name             text not null,
  description      text,
  manufacturer_id  uuid references artisans(id) on delete set null,
  manufacturer_name text,
  quantity         numeric not null default 1,
  unit_price       numeric,                                 -- legacy; mirrors selling_price_unit
  currency         text not null default 'GBP',
  selected_finish  text,
  selected_fabric  text,
  selected_size    text,
  notes            text,                                    -- client-facing note
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  section          text,
  spec_details     text,
  image_url        text,
  -- Sprint 1 commercial line fields
  line_type                text not null default 'product'
    check (line_type in ('product','service','fee','delivery','installation','adjustment')),
  service_catalogue_id     uuid references service_catalogue(id) on delete set null,
  supplier_sku             text,
  fba_sku                  text,
  unit_of_measure          text not null default 'each',
  supplier_cost_unit       numeric,
  supplier_cost_source     text not null default 'unavailable'
    check (supplier_cost_source in ('manual','catalogue_trade','catalogue_supplier','unavailable')),
  supplier_cost_overridden boolean not null default false,
  supplier_cost_override_reason text,
  pricing_method           text check (pricing_method is null or pricing_method in ('markup','margin','manual')),
  pricing_percent          numeric,
  selling_price_unit       numeric,
  discount_type            text check (discount_type is null or discount_type in ('percent','fixed')),
  discount_value           numeric,
  discount_amount          numeric,
  tax_category             text not null default 'standard'
    check (tax_category in ('standard','reduced','zero','exempt','outside_scope')),
  tax_rate_snapshot        numeric,
  line_cost_total          numeric,
  line_net_total           numeric,
  line_tax_total           numeric,
  line_gross_total         numeric,
  procurement_fee_eligible boolean not null default true,
  internal_notes           text
);

create index idx_proforma_line_items_service on proforma_line_items(service_catalogue_id);

create table proforma_downloads (
  id                 uuid primary key default uuid_generate_v4(),
  proforma_id        uuid not null references proformas(id) on delete cascade,
  audience           text not null,                         -- client | manufacturer
  manufacturer_id    uuid references artisans(id) on delete set null,
  manufacturer_name  text,
  recipient_email    text,
  note               text,
  downloaded_by      uuid references users(id) on delete set null,
  downloaded_at      timestamptz not null default now(),
  doc_type           text not null default 'proforma',
  issued_document_id uuid  -- FK added after issued_documents is created below
);

-- ── COMMERCIAL SETTINGS (protected, single row) ──────────────────────────────

create table commercial_settings (
  id                          uuid primary key default uuid_generate_v4(),
  singleton                   boolean not null default true unique check (singleton),
  pricing_method_default      text not null default 'markup' check (pricing_method_default in ('markup','margin')),
  vat_registered              boolean not null default true,
  vat_number                  text,
  default_vat_rate            numeric not null default 20 check (default_vat_rate >= 0 and default_vat_rate <= 100),
  default_tax_category        text not null default 'standard'
    check (default_tax_category in ('standard','reduced','zero','exempt','outside_scope')),
  default_deposit_percent     numeric not null default 50 check (default_deposit_percent >= 0 and default_deposit_percent <= 100),
  deposit_value_rules         jsonb not null default '[]'::jsonb,
  default_quote_expiry_days   integer not null default 30 check (default_quote_expiry_days > 0),
  default_currency            text not null default 'GBP',
  default_payment_terms       text,
  default_lead_time           text,
  procurement_fee_type        text not null default 'none' check (procurement_fee_type in ('percentage','fixed','tiered','none')),
  procurement_fee_basis       text not null default 'product_selling_subtotal'
    check (procurement_fee_basis in ('product_selling_subtotal','product_cost_subtotal','approved_procurement_value','selected_lines','manual_base_amount')),
  procurement_fee_value       numeric not null default 0 check (procurement_fee_value >= 0),
  procurement_fee_tiers       jsonb not null default '[]'::jsonb,
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

-- ── COMMERCIAL SETTING CHANGES (immutable log) ───────────────────────────────

create table commercial_setting_changes (
  id                   uuid primary key default uuid_generate_v4(),
  setting_group        text not null,
  changed_fields       text[] not null,
  before_value         jsonb,                               -- bank values stored masked
  after_value          jsonb,                               -- bank values stored masked
  reason               text,
  actor_user_id        uuid references users(id) on delete set null,
  actor_email_snapshot text,
  request_metadata     jsonb,
  created_at           timestamptz not null default now()
);

create or replace function reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'commercial_setting_changes is append-only';
end $$;

create trigger commercial_setting_changes_immutable
  before update or delete on commercial_setting_changes
  for each row execute function reject_mutation();

-- ── ISSUED DOCUMENTS (immutable frozen snapshots) ────────────────────────────

create table issued_documents (
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

create index idx_issued_documents_proforma on issued_documents(proforma_id);

create trigger issued_documents_immutable
  before update or delete on issued_documents
  for each row execute function reject_mutation();

alter table proforma_downloads
  add constraint proforma_downloads_issued_document_id_fkey
  foreign key (issued_document_id) references issued_documents(id) on delete set null;

-- ── NUMBERING FUNCTIONS (sequence-backed, concurrency-safe) ──────────────────

create or replace function next_invoice_number()
returns text language sql security definer set search_path to 'public'
as $$
  select 'FBA-INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 4, '0')
$$;

create or replace function next_quote_number()
returns text language sql security definer set search_path to 'public'
as $$
  select 'FBA-Q-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('quote_number_seq')::text, 4, '0')
$$;

-- ── COMMERCIAL RLS ───────────────────────────────────────────────────────────
-- All commercial tables are service-role only (no anon policies).

alter table proformas                  enable row level security;
alter table proforma_line_items        enable row level security;
alter table proforma_downloads         enable row level security;
alter table commercial_settings        enable row level security;
alter table commercial_setting_changes enable row level security;
alter table service_catalogue          enable row level security;
alter table issued_documents           enable row level security;
