-- ============================================================
-- FBA Commercial Pipeline — Sprint 4: Delivery, Logistics &
-- Recipient-Specific Documents.
--
-- Runs after 20260712_lock_down_definer_functions.sql (unmodified).
--
--  1) Settings: delivery confirmation link expiry
--  2) delivery_locations + site_contacts (structured site address book)
--  3) deliveries + delivery_lines + delivery_packages (shipments;
--     partial delivery supported; consolidated or direct-from-maker)
--  4) delivery_note_snapshots (immutable no-price issue snapshots)
--  5) proof_of_delivery + pod_photos + delivery_line_exceptions
--  6) delivery_confirmation_tokens (hashed, expiring, revocable —
--     Sprint 3 acceptance-token pattern)
--  7) installations (separate record, own numbering + status)
--  8) Sequences + numbering (FBA-DEL / FBA-INST)
--  9) Atomic SQL functions: dispatch_delivery, record_delivery_pod
-- 10) Private Storage bucket for signatures + POD photos
-- 11) SECURITY DEFINER lockdown (service_role only)
--
-- HOUSE RULES: RLS on every table (no anon policies — service-role
-- only); NO price/cost/money fields anywhere in this schema —
-- delivery documents are no-price by design. Non-destructive,
-- idempotent, safe with existing data.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Settings: confirmation-link expiry (days)
-- ─────────────────────────────────────────────────────────────
alter table commercial_settings
  add column if not exists delivery_confirmation_expiry_days integer not null default 30;

-- ─────────────────────────────────────────────────────────────
-- 2. Delivery locations + site contacts
-- ─────────────────────────────────────────────────────────────
create table if not exists delivery_locations (
  id                  uuid primary key default uuid_generate_v4(),
  commercial_order_id uuid not null references commercial_orders(id) on delete restrict,
  label               text not null default 'Main site',
  address_line1       text,
  address_line2       text,
  city                text,
  region              text,
  postcode            text,
  country             text,
  access_notes        text,   -- lift, parking, floor, delivery hours, restrictions
  created_by          uuid references users(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists idx_delivery_locations_order on delivery_locations(commercial_order_id);
alter table delivery_locations enable row level security;

create table if not exists site_contacts (
  id                   uuid primary key default uuid_generate_v4(),
  delivery_location_id uuid not null references delivery_locations(id) on delete cascade,
  name                 text not null,
  role                 text,
  phone                text,
  email                text,
  is_primary           boolean not null default false,
  notes                text,
  created_at           timestamptz not null default now()
);
create index if not exists idx_site_contacts_location on site_contacts(delivery_location_id);
alter table site_contacts enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 3. Deliveries (shipments) + lines + packages
--    NOTE: order "lines" are proforma_line_items via the order's
--    source proforma (same convention as supplier_allocations.
--    source_line_item_id) — there is no separate order-lines table.
-- ─────────────────────────────────────────────────────────────
create sequence if not exists delivery_number_seq;
create sequence if not exists installation_number_seq;

create or replace function public.next_delivery_number()
returns text language sql security definer set search_path to 'public' as $$
  select 'FBA-DEL-' || to_char(now(),'YYYY') || '-' || lpad(nextval('delivery_number_seq')::text, 4, '0')
$$;

create or replace function public.next_installation_number()
returns text language sql security definer set search_path to 'public' as $$
  select 'FBA-INST-' || to_char(now(),'YYYY') || '-' || lpad(nextval('installation_number_seq')::text, 4, '0')
$$;

create table if not exists deliveries (
  id                     uuid primary key default uuid_generate_v4(),
  delivery_number        text not null unique,          -- FBA-DEL-YYYY-NNNN (own serial)
  commercial_order_id    uuid not null references commercial_orders(id) on delete restrict,
  proforma_reference     text,                          -- source proforma number this ties back to
  delivery_location_id   uuid references delivery_locations(id) on delete restrict,
  origin_type            text not null default 'consolidated'
    check (origin_type in ('consolidated','direct_maker')),
  origin_manufacturer_id uuid references artisans(id) on delete restrict,
  dispatch_status        text not null default 'pending'
    check (dispatch_status in ('pending','preparing','dispatched','in_transit','delivered','partially_delivered','failed','returned')),
  carrier                text,
  expected_date          date,
  dispatched_at          timestamptz,
  delivered_at           timestamptz,
  instructions           text,                          -- delivery-specific instructions
  locked_at              timestamptz,                   -- set when the delivery note is issued (dispatch)
  issued_by              uuid references users(id) on delete set null,
  issued_at              timestamptz,
  created_by             uuid references users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint chk_direct_maker_has_manufacturer
    check (origin_type <> 'direct_maker' or origin_manufacturer_id is not null)
);
create index if not exists idx_deliveries_order  on deliveries(commercial_order_id);
create index if not exists idx_deliveries_status on deliveries(dispatch_status);
alter table deliveries enable row level security;

create table if not exists delivery_lines (
  id                  uuid primary key default uuid_generate_v4(),
  delivery_id         uuid not null references deliveries(id) on delete cascade,
  source_line_item_id uuid not null references proforma_line_items(id) on delete restrict,
  quantity            numeric not null check (quantity > 0),  -- quantity in THIS shipment
  notes               text,
  created_at          timestamptz not null default now(),
  unique (delivery_id, source_line_item_id)
);
create index if not exists idx_delivery_lines_delivery on delivery_lines(delivery_id);
create index if not exists idx_delivery_lines_source   on delivery_lines(source_line_item_id);
alter table delivery_lines enable row level security;

create table if not exists delivery_packages (
  id          uuid primary key default uuid_generate_v4(),
  delivery_id uuid not null references deliveries(id) on delete cascade,
  reference   text,          -- consignment / tracking number (reference only, no carrier API)
  description text,
  weight      text,
  dimensions  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_delivery_packages_delivery on delivery_packages(delivery_id);
alter table delivery_packages enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 4. Immutable delivery-note snapshots (issued at dispatch)
-- ─────────────────────────────────────────────────────────────
create table if not exists delivery_note_snapshots (
  id              uuid primary key default uuid_generate_v4(),
  delivery_id     uuid not null references deliveries(id) on delete cascade,
  delivery_number text not null,
  snapshot        jsonb not null,       -- no-price by design (guarded in app before render/issue)
  issued_by       uuid references users(id) on delete set null,
  issued_at       timestamptz not null default now(),
  unique (delivery_id)
);
alter table delivery_note_snapshots enable row level security;
drop trigger if exists delivery_note_snapshots_immutable on delivery_note_snapshots;
create trigger delivery_note_snapshots_immutable
  before update or delete on delivery_note_snapshots
  for each row execute function public.reject_mutation();

-- ─────────────────────────────────────────────────────────────
-- 5. Proof of delivery + photos + line exceptions
-- ─────────────────────────────────────────────────────────────
create table if not exists proof_of_delivery (
  id               uuid primary key default uuid_generate_v4(),
  delivery_id      uuid not null references deliveries(id) on delete restrict,
  received_by_name text not null,
  received_at      timestamptz not null default now(),
  condition_notes  text,
  signature_url    text,                 -- private Storage path; served via short-lived signed URLs
  method           text not null check (method in ('site_link','admin')),
  ip_hash          text,                 -- hashed, never raw; site_link only
  token_id         uuid,
  recorded_by      uuid references users(id) on delete set null,   -- admin method only
  created_at       timestamptz not null default now()
);
create index if not exists idx_pod_delivery on proof_of_delivery(delivery_id);
alter table proof_of_delivery enable row level security;

create table if not exists pod_photos (
  id         uuid primary key default uuid_generate_v4(),
  pod_id     uuid not null references proof_of_delivery(id) on delete cascade,
  url        text not null,              -- private Storage path
  caption    text,
  created_at timestamptz not null default now()
);
create index if not exists idx_pod_photos_pod on pod_photos(pod_id);
alter table pod_photos enable row level security;

create table if not exists delivery_line_exceptions (
  id                uuid primary key default uuid_generate_v4(),
  delivery_line_id  uuid not null references delivery_lines(id) on delete cascade,
  pod_id            uuid references proof_of_delivery(id) on delete set null,
  type              text not null check (type in ('shortage','damage','wrong_item')),
  quantity_affected numeric not null check (quantity_affected > 0),
  notes             text,
  resolution_status text not null default 'open'
    check (resolution_status in ('open','reordering','credited','resolved')),
  resolution_notes  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_line_exceptions_line on delivery_line_exceptions(delivery_line_id);
create index if not exists idx_line_exceptions_status on delivery_line_exceptions(resolution_status);
alter table delivery_line_exceptions enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 6. Delivery confirmation tokens (Sprint 3 acceptance pattern:
--    256-bit random, SHA-256 hashed at rest, expiring, revocable,
--    one active per delivery, single-use)
-- ─────────────────────────────────────────────────────────────
create table if not exists delivery_confirmation_tokens (
  id              uuid primary key default uuid_generate_v4(),
  delivery_id     uuid not null references deliveries(id) on delete cascade,
  token_hash      text not null unique,   -- sha-256 hex; raw token never stored
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  first_viewed_at timestamptz,
  used_at         timestamptz,
  created_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_delivery_tokens_delivery on delivery_confirmation_tokens(delivery_id);
alter table delivery_confirmation_tokens enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 7. Installations (separate record, own numbering + lifecycle)
-- ─────────────────────────────────────────────────────────────
create table if not exists installations (
  id                  uuid primary key default uuid_generate_v4(),
  installation_number text not null unique,       -- FBA-INST-YYYY-NNNN
  commercial_order_id uuid not null references commercial_orders(id) on delete restrict,
  status              text not null default 'to_schedule'
    check (status in ('not_required','to_schedule','scheduled','in_progress','completed','snagging')),
  scheduled_date      date,
  installer_name      text,
  installer_contact   text,
  access_notes        text,
  linked_delivery_id  uuid references deliveries(id) on delete set null,
  completion_notes    text,
  signed_off_by       text,
  signed_off_at       timestamptz,
  created_by          uuid references users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_installations_order on installations(commercial_order_id);
create index if not exists idx_installations_status on installations(status);
alter table installations enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 8. Atomic dispatch: validate → issue immutable delivery-note
--    snapshot → advance status, in one transaction.
-- ─────────────────────────────────────────────────────────────
create or replace function public.dispatch_delivery(
  p_delivery_id uuid, p_snapshot jsonb, p_actor uuid
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_del   deliveries%rowtype;
  v_lines integer;
begin
  select * into v_del from deliveries where id = p_delivery_id for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_del.dispatch_status not in ('pending','preparing') then
    return jsonb_build_object('ok',false,'error','bad_status','status',v_del.dispatch_status);
  end if;
  if v_del.delivery_location_id is null then
    return jsonb_build_object('ok',false,'error','no_location');
  end if;
  select count(*) into v_lines from delivery_lines where delivery_id = p_delivery_id;
  if v_lines = 0 then return jsonb_build_object('ok',false,'error','no_lines'); end if;

  insert into delivery_note_snapshots(delivery_id, delivery_number, snapshot, issued_by)
    values (p_delivery_id, v_del.delivery_number, p_snapshot, p_actor)
    on conflict (delivery_id) do nothing;

  update deliveries set
    dispatch_status = 'dispatched',
    dispatched_at   = now(),
    locked_at       = coalesce(locked_at, now()),
    issued_by       = coalesce(issued_by, p_actor),
    issued_at       = coalesce(issued_at, now()),
    updated_at      = now()
  where id = p_delivery_id;

  return jsonb_build_object('ok',true,'delivery_number',v_del.delivery_number);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 9. Atomic proof of delivery. Handles BOTH channels:
--     • site_link — p_token_hash validated & consumed atomically
--     • admin     — p_token_hash null, p_actor recorded
--    Writes POD + photos + exceptions and advances the delivery
--    (shortage exceptions ⇒ partially_delivered, else delivered).
-- ─────────────────────────────────────────────────────────────
create or replace function public.record_delivery_pod(
  p_delivery_id uuid, p_token_hash text, p_method text,
  p_received_by text, p_condition_notes text, p_signature_url text,
  p_photos jsonb, p_exceptions jsonb, p_ip_hash text, p_actor uuid
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_del      deliveries%rowtype;
  v_tok      delivery_confirmation_tokens%rowtype;
  v_pod_id   uuid;
  v_photo    jsonb;
  v_exc      jsonb;
  v_line_ok  integer;
  v_shortage boolean := false;
  v_status   text;
  v_del_id   uuid := p_delivery_id;
begin
  if p_method not in ('site_link','admin') then
    return jsonb_build_object('ok',false,'error','bad_method');
  end if;

  -- Site-link channel: resolve delivery from the token, validate, consume.
  if p_method = 'site_link' then
    if p_token_hash is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
    select * into v_tok from delivery_confirmation_tokens where token_hash = p_token_hash for update;
    if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
    if v_tok.revoked_at is not null then return jsonb_build_object('ok',false,'error','revoked'); end if;
    if v_tok.used_at is not null then return jsonb_build_object('ok',false,'error','used'); end if;
    if v_tok.expires_at < now() then return jsonb_build_object('ok',false,'error','expired'); end if;
    v_del_id := v_tok.delivery_id;
  end if;

  select * into v_del from deliveries where id = v_del_id for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_del.dispatch_status not in ('dispatched','in_transit','partially_delivered') then
    return jsonb_build_object('ok',false,'error','bad_status','status',v_del.dispatch_status);
  end if;

  if p_method = 'site_link' then
    update delivery_confirmation_tokens set used_at = now() where id = v_tok.id;
  end if;

  insert into proof_of_delivery(
    delivery_id, received_by_name, condition_notes, signature_url,
    method, ip_hash, token_id, recorded_by
  ) values (
    v_del_id, p_received_by, p_condition_notes, p_signature_url,
    p_method, p_ip_hash, case when p_method = 'site_link' then v_tok.id else null end,
    case when p_method = 'admin' then p_actor else null end
  ) returning id into v_pod_id;

  if p_photos is not null and jsonb_typeof(p_photos) = 'array' then
    for v_photo in select * from jsonb_array_elements(p_photos) loop
      if coalesce(v_photo->>'url','') <> '' then
        insert into pod_photos(pod_id, url, caption)
          values (v_pod_id, v_photo->>'url', nullif(v_photo->>'caption',''));
      end if;
    end loop;
  end if;

  if p_exceptions is not null and jsonb_typeof(p_exceptions) = 'array' then
    for v_exc in select * from jsonb_array_elements(p_exceptions) loop
      -- The exception line must belong to THIS delivery.
      select count(*) into v_line_ok from delivery_lines
        where id = (v_exc->>'delivery_line_id')::uuid and delivery_id = v_del_id;
      if v_line_ok = 0 then
        raise exception 'exception line % does not belong to delivery %', v_exc->>'delivery_line_id', v_del_id;
      end if;
      if (v_exc->>'type') not in ('shortage','damage','wrong_item') then
        raise exception 'bad exception type %', v_exc->>'type';
      end if;
      insert into delivery_line_exceptions(delivery_line_id, pod_id, type, quantity_affected, notes)
        values (
          (v_exc->>'delivery_line_id')::uuid, v_pod_id, v_exc->>'type',
          greatest(coalesce((v_exc->>'quantity_affected')::numeric, 1), 0.0001),
          nullif(v_exc->>'notes','')
        );
      if (v_exc->>'type') = 'shortage' then v_shortage := true; end if;
    end loop;
  end if;

  v_status := case when v_shortage then 'partially_delivered' else 'delivered' end;
  update deliveries set
    dispatch_status = v_status,
    delivered_at    = now(),
    updated_at      = now()
  where id = v_del_id;

  return jsonb_build_object('ok',true,'pod_id',v_pod_id,'status',v_status,'delivery_id',v_del_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 10. Private Storage bucket for signatures + POD photos.
--     No storage.objects policies are created: anon/authenticated
--     have no access; the app uses the service-role client and
--     short-lived signed URLs.
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('delivery-pod', 'delivery-pod', false, 5242880, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 11. SECURITY DEFINER lockdown — service_role only (matches
--     20260712_lock_down_definer_functions.sql).
-- ─────────────────────────────────────────────────────────────
do $$
declare
  fn text;
  sigs text[] := array[
    'public.next_delivery_number()',
    'public.next_installation_number()',
    'public.dispatch_delivery(uuid,jsonb,uuid)',
    'public.record_delivery_pod(uuid,text,text,text,text,text,jsonb,jsonb,text,uuid)'
  ];
begin
  foreach fn in array sigs loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
