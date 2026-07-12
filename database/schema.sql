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


-- ═════════════════════════════════════════════════════════════════════════════
-- SUPPLIER PROCUREMENT (Sprint 2, 2026-07)
-- Canonical definitions matching migration 20260711_supplier_purchase_orders.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ── ARTISANS: supplier/manufacturer identity fields ──────────────────────────
-- (added by migration; canonical for fresh databases)
alter table artisans
  add column legal_name                  text,
  add column trading_name                text,
  add column primary_contact_name        text,
  add column order_email                 text,
  add column finance_email               text,
  add column telephone                   text,
  add column address                     text,
  add column country                     text,
  add column default_currency            text not null default 'GBP',
  add column default_payment_terms       text,
  add column default_lead_time           text,
  add column minimum_order_value         numeric,
  add column incoterms                   text,
  add column vat_or_tax_number           text,
  add column company_registration_number text,
  add column ordering_notes              text,
  add column delivery_notes              text;

-- ── PRODUCTS: supplier ordering fields ───────────────────────────────────────
alter table products
  add column supplier_currency text,
  add column supplier_sku      text,
  add column min_order_qty     numeric,
  add column ordering_notes    text;

-- ── COMMERCIAL SETTINGS: procurement thresholds ──────────────────────────────
alter table commercial_settings
  add column po_value_approval_threshold   numeric,
  add column po_freight_approval_threshold numeric,
  add column default_acknowledgement_days  integer not null default 5;

-- ── COMMERCIAL ORDERS (sales-order boundary) ─────────────────────────────────

create sequence if not exists sales_order_number_seq;

create or replace function next_sales_order_number()
returns text language sql security definer set search_path to 'public'
as $$
  select 'FBA-SO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('sales_order_number_seq')::text, 4, '0')
$$;

create table commercial_orders (
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
  commercial_snapshot    jsonb not null,          -- immutable conversion snapshot
  duplicate_override_reason text,                 -- Ultra Admin only
  accepted_at            timestamptz,
  cancelled_at           timestamptz,
  cancel_reason          text,
  created_by             uuid references users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- One order per accepted source revision unless Ultra Admin overrides.
create unique index uq_commercial_orders_source_revision
  on commercial_orders (source_proforma_id, source_revision_number)
  where duplicate_override_reason is null and status <> 'cancelled';
create index idx_commercial_orders_status on commercial_orders(status);
create index idx_commercial_orders_source on commercial_orders(source_proforma_id);

-- ── SUPPLIER ALLOCATIONS (client line → manufacturer) ────────────────────────

create table supplier_allocations (
  id                        uuid primary key default uuid_generate_v4(),
  commercial_order_id       uuid not null references commercial_orders(id) on delete cascade,
  source_line_item_id       uuid not null references proforma_line_items(id) on delete restrict,
  manufacturer_id           uuid not null references artisans(id) on delete restrict,
  supplier_product_id       uuid references products(id) on delete set null,
  supplier_sku              text,
  quantity                  numeric not null check (quantity > 0),
  unit_of_measure           text not null default 'each',
  supplier_currency         text,               -- null = unknown (blocks PO); never fabricated
  supplier_cost_unit        numeric,            -- null = unknown (blocks PO); never fabricated
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

create index idx_supplier_allocations_order on supplier_allocations(commercial_order_id);
create index idx_supplier_allocations_manufacturer on supplier_allocations(manufacturer_id);
create index idx_supplier_allocations_status on supplier_allocations(allocation_status);
create index idx_supplier_allocations_source_line on supplier_allocations(source_line_item_id);

-- ── PURCHASE ORDERS (one manufacturer per PO) ────────────────────────────────

create sequence if not exists purchase_order_number_seq;

create or replace function next_purchase_order_number()
returns text language sql security definer set search_path to 'public'
as $$
  select 'FBA-PO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('purchase_order_number_seq')::text, 4, '0')
$$;

create table purchase_orders (
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
  supplier_contact_snapshot  jsonb,
  delivery_address_snapshot  text,
  payment_terms_snapshot     text,
  incoterms_snapshot         text,
  shipping_total             numeric not null default 0,
  packaging_total            numeric not null default 0,
  other_charges_total        numeric not null default 0,
  other_charges_description  text,
  discount_total             numeric not null default 0,
  subtotal                   numeric,
  tax_total                  numeric,
  grand_total                numeric,
  totals                     jsonb,               -- server calculation cache
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
  margin_at_risk             boolean not null default false,
  margin_analysis            jsonb,               -- INTERNAL: never in supplier output
  margin_resolution          text
    check (margin_resolution is null or margin_resolution in ('accepted_internal_reduction','client_variation_required','supplier_negotiation_required','alternative_supplier_required','cancelled')),
  margin_resolution_note     text,
  acknowledged_by_name       text,
  acknowledged_by_email      text,
  acknowledged_at            timestamptz,
  acknowledgement_notes      text,
  expected_completion_date   date,
  supplier_recipient_email   text,
  cc_emails                  text[] not null default '{}',
  send_status                text not null default 'not_prepared'
    check (send_status in ('not_prepared','approved_not_sent','sent')),
  locked_at                  timestamptz,         -- set on issue; blocks mutation
  superseded_by_revision     integer,
  cancelled_at               timestamptz,
  cancel_reason              text,
  created_by                 uuid references users(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index idx_purchase_orders_manufacturer on purchase_orders(manufacturer_id);
create index idx_purchase_orders_commercial_order on purchase_orders(commercial_order_id);
create index idx_purchase_orders_status on purchase_orders(status);
create index idx_purchase_orders_issued_at on purchase_orders(issued_at);

create table purchase_order_lines (
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

create index idx_po_lines_po on purchase_order_lines(purchase_order_id);
create index idx_po_lines_allocation on purchase_order_lines(supplier_allocation_id);

-- ── PO ISSUE SNAPSHOTS (immutable) ───────────────────────────────────────────

create table purchase_order_snapshots (
  id                uuid primary key default uuid_generate_v4(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  revision          integer not null default 1,
  document_number   text not null,              -- FBA-PO-YYYY-NNNN[-Rnn]
  snapshot          jsonb not null,             -- supplier-safe frozen document
  issued_by         uuid references users(id) on delete set null,
  issued_at         timestamptz not null default now(),
  unique (purchase_order_id, revision)
);

create index idx_po_snapshots_po on purchase_order_snapshots(purchase_order_id);

create trigger purchase_order_snapshots_immutable
  before update or delete on purchase_order_snapshots
  for each row execute function reject_mutation();

-- ── SUPPLIER ACKNOWLEDGEMENT TOKENS (hashed, expiring, revocable) ────────────

create table purchase_order_ack_tokens (
  id                uuid primary key default uuid_generate_v4(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  revision          integer not null,
  token_hash        text not null unique,       -- sha-256; raw token never stored
  expires_at        timestamptz not null,
  revoked_at        timestamptz,                -- set on revision/cancel
  first_viewed_at   timestamptz,
  used_at           timestamptz,                -- acknowledge / amendment request
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index idx_po_ack_tokens_po on purchase_order_ack_tokens(purchase_order_id);

-- ── SPRINT 2 RLS (service-role only; no anon policies) ───────────────────────

alter table commercial_orders         enable row level security;
alter table supplier_allocations      enable row level security;
alter table purchase_orders           enable row level security;
alter table purchase_order_lines      enable row level security;
alter table purchase_order_snapshots  enable row level security;
alter table purchase_order_ack_tokens enable row level security;

-- ============================================================
-- SPRINT 3 — Client Acceptance, Payments, Invoices, Credit Control
-- (canonical; applied via 20260712_client_invoices_payments.sql
--  and 20260712_lock_down_definer_functions.sql)
-- ============================================================

-- commercial_settings additions:
--   default_deposit_basis text ('gross_total'|'net_subtotal'),
--   default_payment_terms_days int, payment_backdate_approval_days int
-- proformas addition:
--   acceptance_status text ('unknown'|'not_sent'|'sent'|'viewed'|'accepted'|'declined'|'expired'|'superseded')

create table commercial_acceptances (
  id uuid primary key default uuid_generate_v4(),
  proforma_id uuid not null references proformas(id) on delete restrict,
  issued_document_id uuid not null references issued_documents(id) on delete restrict,
  document_type text not null, document_number text not null, revision integer not null,
  accepted_by_name text not null, accepted_by_email text not null,
  acceptance_method text not null default 'secure_link'
    check (acceptance_method in ('secure_link','email_confirmation','signed_document','admin_recorded','other')),
  acceptance_notes text, acceptance_evidence text, accepted_at timestamptz not null default now(),
  ip_hash text, user_agent text, token_id uuid, recorded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index uq_acceptance_source_revision on commercial_acceptances (issued_document_id, revision);
-- RLS enabled, no anon policy.

create table commercial_acceptance_tokens (
  id uuid primary key default uuid_generate_v4(),
  issued_document_id uuid not null references issued_documents(id) on delete cascade,
  proforma_id uuid not null references proformas(id) on delete cascade,
  revision integer not null, token_hash text not null unique, expires_at timestamptz not null,
  revoked_at timestamptz, first_viewed_at timestamptz, used_at timestamptz,
  created_by uuid references users(id) on delete set null, created_at timestamptz not null default now()
); -- RLS enabled, no anon policy.

create table sales_invoices (
  id uuid primary key default uuid_generate_v4(),
  invoice_number text unique,
  invoice_type text not null default 'final' check (invoice_type in ('deposit','stage','final','service','adjustment')),
  commercial_order_id uuid references commercial_orders(id) on delete restrict,
  source_proforma_id uuid references proformas(id) on delete set null,
  source_issued_document_id uuid references issued_documents(id) on delete set null,
  source_revision integer, client_id uuid references users(id) on delete set null,
  project_id uuid references projects(id) on delete set null, currency text not null default 'GBP',
  status text not null default 'draft'
    check (status in ('draft','pending_approval','approved','issued','partially_paid','paid','overdue','void','credited','cancelled')),
  issue_date date, due_date date, tax_point_date date,
  billing_address_snapshot text, delivery_address_snapshot text,
  client_snapshot jsonb, project_snapshot jsonb, company_snapshot jsonb, bank_snapshot jsonb, payment_terms_snapshot text,
  subtotal numeric not null default 0, tax_total numeric not null default 0, gross_total numeric not null default 0,
  amount_paid numeric not null default 0,   -- DERIVED
  credit_total numeric not null default 0,  -- DERIVED
  balance_due numeric not null default 0,   -- DERIVED
  approval_status text not null default 'none' check (approval_status in ('none','required','approved')),
  approval_reason text, approved_by uuid references users(id) on delete set null, approved_at timestamptz,
  locked_at timestamptz, issued_by uuid references users(id) on delete set null, issued_at timestamptz,
  voided_at timestamptz, void_reason text,
  reminder_status text not null default 'none' check (reminder_status in ('none','first_sent','second_sent','final_sent')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
); -- RLS enabled, no anon policy. Trigger guard_issued_invoice() blocks post-issue mutation of commercial fields.

create table sales_invoice_lines (
  id uuid primary key default uuid_generate_v4(),
  sales_invoice_id uuid not null references sales_invoices(id) on delete cascade,
  source_line_item_id uuid references proforma_line_items(id) on delete set null,
  line_type text not null default 'product', product_id uuid references products(id) on delete set null,
  service_catalogue_id uuid references service_catalogue(id) on delete set null,
  name_snapshot text not null, description_snapshot text, specification_snapshot text,
  quantity numeric not null default 1 check (quantity > 0), unit_of_measure text not null default 'each',
  unit_price numeric not null default 0,   -- client selling price only (no supplier cost/margin)
  discount_amount numeric not null default 0,
  tax_category text not null default 'standard' check (tax_category in ('standard','reduced','zero','exempt','outside_scope')),
  tax_rate_snapshot numeric, line_net_total numeric not null default 0, line_tax_total numeric not null default 0,
  line_gross_total numeric not null default 0, sort_order integer not null default 0, created_at timestamptz not null default now()
); -- RLS enabled, no anon policy.

create table sales_invoice_snapshots (  -- immutable (reject_mutation trigger); one per invoice
  id uuid primary key default uuid_generate_v4(),
  sales_invoice_id uuid not null references sales_invoices(id) on delete cascade unique,
  invoice_number text not null, snapshot jsonb not null,
  issued_by uuid references users(id) on delete set null, issued_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default uuid_generate_v4(), payment_reference text not null unique,
  client_id uuid references users(id) on delete set null,
  commercial_order_id uuid references commercial_orders(id) on delete set null,
  currency text not null default 'GBP', amount numeric not null check (amount > 0),
  payment_date date not null default current_date,
  payment_method text not null default 'bank_transfer' check (payment_method in ('bank_transfer','card','cash','cheque','credit','other')),
  external_reference text, bank_reference text,
  status text not null default 'pending' check (status in ('pending','confirmed','reversed','refunded','failed')),
  notes text, recorded_by uuid references users(id) on delete set null, approved_by uuid references users(id) on delete set null,
  confirmed_at timestamptz, reversed_at timestamptz, reversal_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
); -- RLS enabled, no anon policy.

create table payment_allocations (
  id uuid primary key default uuid_generate_v4(),
  payment_id uuid not null references payments(id) on delete cascade,
  sales_invoice_id uuid not null references sales_invoices(id) on delete restrict,
  amount numeric not null check (amount > 0),
  allocated_by uuid references users(id) on delete set null, allocated_at timestamptz not null default now()
); -- RLS enabled, no anon policy.

create table payment_receipts (  -- immutable (reject_mutation trigger)
  id uuid primary key default uuid_generate_v4(), receipt_number text not null unique,
  payment_id uuid not null references payments(id) on delete cascade, snapshot jsonb not null,
  issued_by uuid references users(id) on delete set null, issued_at timestamptz not null default now()
);

create table credit_notes (
  id uuid primary key default uuid_generate_v4(), credit_note_number text unique,
  sales_invoice_id uuid not null references sales_invoices(id) on delete restrict,
  client_id uuid references users(id) on delete set null, currency text not null default 'GBP',
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','issued','allocated','void')),
  reason text, subtotal numeric not null default 0, tax_total numeric not null default 0, gross_total numeric not null default 0,
  allocated_total numeric not null default 0,  -- DERIVED
  approval_status text not null default 'none' check (approval_status in ('none','required','approved')),
  approved_by uuid references users(id) on delete set null, approved_at timestamptz,
  locked_at timestamptz, issued_by uuid references users(id) on delete set null, issued_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
); -- RLS enabled, no anon policy.

create table credit_note_lines (
  id uuid primary key default uuid_generate_v4(),
  credit_note_id uuid not null references credit_notes(id) on delete cascade,
  source_invoice_line_id uuid references sales_invoice_lines(id) on delete set null,
  name_snapshot text not null, description_snapshot text, quantity numeric not null default 1,
  unit_price numeric not null default 0, discount_amount numeric not null default 0,
  tax_category text not null default 'standard' check (tax_category in ('standard','reduced','zero','exempt','outside_scope')),
  tax_rate_snapshot numeric, line_net_total numeric not null default 0, line_tax_total numeric not null default 0,
  line_gross_total numeric not null default 0, sort_order integer not null default 0, created_at timestamptz not null default now()
);

create table credit_note_allocations (
  id uuid primary key default uuid_generate_v4(),
  credit_note_id uuid not null references credit_notes(id) on delete cascade,
  sales_invoice_id uuid not null references sales_invoices(id) on delete restrict,
  amount numeric not null check (amount > 0),
  allocated_by uuid references users(id) on delete set null, allocated_at timestamptz not null default now()
);

create table credit_note_snapshots (  -- immutable (reject_mutation trigger)
  id uuid primary key default uuid_generate_v4(),
  credit_note_id uuid not null references credit_notes(id) on delete cascade unique,
  credit_note_number text not null, snapshot jsonb not null,
  issued_by uuid references users(id) on delete set null, issued_at timestamptz not null default now()
);

-- Sequences: credit_note_number_seq, receipt_number_seq (FBA-INV reused from Sprint 1)
-- Numbering: next_credit_note_number() → FBA-CN-YYYY-NNNN, next_receipt_number() → FBA-RCPT-YYYY-NNNN
-- Atomic SECURITY DEFINER functions (service_role EXECUTE only):
--   accept_commercial_document, allocate_payment, reverse_payment,
--   issue_sales_invoice, issue_credit_note, allocate_credit_note,
--   recompute_invoice_financials, acknowledge_purchase_order (Sprint 2 atomicity fix)
-- Triggers: guard_issued_invoice (immutability of issued invoice content),
--   reject_mutation on sales_invoice_snapshots / payment_receipts / credit_note_snapshots
