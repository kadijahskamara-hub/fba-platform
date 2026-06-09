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
  updated_at    timestamptz not null default now()
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
