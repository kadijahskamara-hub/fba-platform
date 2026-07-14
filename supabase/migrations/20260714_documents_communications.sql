-- ============================================================
-- FBA Commercial Pipeline — Sprint 5: Document Generation,
-- Storage & Prepared Communications.
--
-- Runs after 20260713_delivery_logistics.sql (unmodified).
--
--  1) document_files          — immutable, checksummed, versioned
--                               store of server-generated PDFs.
--  2) communication_templates — versioned editable message templates
--                               (subject + body + {{variables}}).
--  3) communication_packs     — prepared, downloadable comms packs
--                               (NO in-platform sending; staff send
--                               from their own mailbox, then mark sent).
--  4) communication_events    — append-only per-pack event trail.
--  5) Sequence + numbering     FBA-COM-YYYY-NNNN.
--  6) Atomic SQL functions     mark_pack_downloaded / _sent /
--                               _needs_attention / supersede_pack.
--  7) Private Storage bucket   issued-documents (service-role only).
--  8) Seed default templates.
--  9) SECURITY DEFINER lockdown (service_role only).
--
-- HOUSE RULES: RLS on every table (no anon/authenticated policies —
-- service-role only); immutable artefacts (reject_mutation-style
-- triggers); atomic state changes via SECURITY DEFINER functions
-- revoked to service_role. Non-destructive, idempotent.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. document_files — immutable, checksummed, versioned PDFs.
--
--    entity_type covers every issued document family. For
--    'issued_document' the entity_id is issued_documents.id (its
--    doc_type — quote/proforma/invoice/service_invoice — lives on
--    that row). 'delivery_note' rows always carry an audience.
--    version is per (entity_type, entity_id, audience): a
--    regeneration inserts version+1 and points the old row's
--    superseded_by_id at it — old bytes are never overwritten.
-- ─────────────────────────────────────────────────────────────
create table if not exists document_files (
  id               uuid primary key default uuid_generate_v4(),
  entity_type      text not null check (entity_type in (
                     'issued_document','sales_invoice','credit_note',
                     'payment_receipt','purchase_order','delivery_note','statement')),
  entity_id        uuid not null,
  document_number  text not null,
  revision         integer not null default 1,
  audience         text check (audience in ('client','site','manufacturer')),  -- null = single-audience doc
  version          integer not null default 1,
  storage_path     text not null,
  mime_type        text not null default 'application/pdf',
  byte_size        integer not null check (byte_size >= 0),
  sha256           text not null check (char_length(sha256) = 64),
  engine           text not null default 'jspdf@4',
  generated_by     uuid references users(id) on delete set null,
  generated_at     timestamptz not null default now(),
  superseded_by_id uuid references document_files(id) on delete set null
);
create unique index if not exists uq_document_files_version
  on document_files (entity_type, entity_id, coalesce(audience, '_none_'), version);
create index if not exists idx_document_files_entity on document_files (entity_type, entity_id);
create index if not exists idx_document_files_current on document_files (entity_type, entity_id)
  where superseded_by_id is null;
alter table document_files enable row level security;

-- Immutability: a generated file is frozen. The ONLY permitted change
-- is setting superseded_by_id exactly once (null -> value) when a newer
-- version is generated. Everything else — and DELETE — is rejected.
create or replace function public.reject_document_file_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'document_files is immutable (delete blocked)';
  end if;
  if ( new.id              is distinct from old.id
    or new.entity_type     is distinct from old.entity_type
    or new.entity_id       is distinct from old.entity_id
    or new.document_number is distinct from old.document_number
    or new.revision        is distinct from old.revision
    or new.audience        is distinct from old.audience
    or new.version         is distinct from old.version
    or new.storage_path    is distinct from old.storage_path
    or new.mime_type       is distinct from old.mime_type
    or new.byte_size       is distinct from old.byte_size
    or new.sha256          is distinct from old.sha256
    or new.engine          is distinct from old.engine
    or new.generated_by    is distinct from old.generated_by
    or new.generated_at    is distinct from old.generated_at ) then
    raise exception 'document_files is immutable (only superseded_by_id may change)';
  end if;
  if old.superseded_by_id is not null
     and new.superseded_by_id is distinct from old.superseded_by_id then
    raise exception 'document_files.superseded_by_id is already set';
  end if;
  return new;
end $$;

drop trigger if exists document_files_immutable on document_files;
create trigger document_files_immutable
  before update or delete on document_files
  for each row execute function public.reject_document_file_mutation();

-- ─────────────────────────────────────────────────────────────
-- 2. communication_templates — versioned, editable message copy.
--    Editing = deactivate the current row + insert a new active
--    version (history preserved). One active row per template_key.
-- ─────────────────────────────────────────────────────────────
create table if not exists communication_templates (
  id               uuid primary key default uuid_generate_v4(),
  template_key     text not null,
  label            text not null,
  audience         text not null check (audience in ('client','manufacturer','delivery_recipient')),
  subject_template text not null,
  body_template    text not null,
  variables        jsonb not null default '[]'::jsonb,  -- documented available {{keys}}
  version          integer not null default 1,
  is_active        boolean not null default true,
  updated_by       uuid references users(id) on delete set null,
  updated_at       timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create unique index if not exists uq_templates_active_key
  on communication_templates (template_key) where is_active;
create index if not exists idx_templates_key_version on communication_templates (template_key, version desc);
alter table communication_templates enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 3. communication_packs — prepared, downloadable comms packs.
--    Mutable pre-download (allowlisted fields only, enforced in
--    app); state changes afterwards flow through atomic functions.
-- ─────────────────────────────────────────────────────────────
create table if not exists communication_packs (
  id                  uuid primary key default uuid_generate_v4(),
  pack_number         text not null unique,          -- FBA-COM-YYYY-NNNN
  pack_type           text not null check (pack_type in ('client','manufacturer','delivery_recipient')),
  template_key        text not null,
  template_version    integer not null,
  commercial_order_id uuid references commercial_orders(id) on delete set null,
  proforma_id         uuid references proformas(id) on delete set null,
  sales_invoice_id    uuid references sales_invoices(id) on delete set null,
  purchase_order_id   uuid references purchase_orders(id) on delete set null,
  delivery_id         uuid references deliveries(id) on delete set null,
  recipients_snapshot jsonb not null default '{}'::jsonb,   -- {to:[], cc:[], names:{}}
  subject             text not null,
  body                text not null,
  attachment_file_ids uuid[] not null default '{}',         -- -> document_files.id
  status              text not null default 'prepared'
    check (status in ('prepared','downloaded','marked_sent','needs_attention','superseded')),
  sent_via            text,
  marked_sent_by      uuid references users(id) on delete set null,
  marked_sent_at      timestamptz,
  attention_note      text,
  version             integer not null default 1,
  superseded_by_id    uuid references communication_packs(id) on delete set null,
  created_by          uuid references users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint chk_pack_has_entity check (
    commercial_order_id is not null or proforma_id is not null
    or sales_invoice_id is not null or purchase_order_id is not null
    or delivery_id is not null)
);
create index if not exists idx_packs_status on communication_packs (status);
create index if not exists idx_packs_order  on communication_packs (commercial_order_id);
create index if not exists idx_packs_po     on communication_packs (purchase_order_id);
create index if not exists idx_packs_invoice on communication_packs (sales_invoice_id);
create index if not exists idx_packs_delivery on communication_packs (delivery_id);
alter table communication_packs enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 4. communication_events — append-only per-pack trail.
-- ─────────────────────────────────────────────────────────────
create table if not exists communication_events (
  id         uuid primary key default uuid_generate_v4(),
  pack_id    uuid not null references communication_packs(id) on delete cascade,
  event      text not null check (event in (
               'prepared','edited','downloaded','marked_sent',
               'needs_attention','re_prepared','superseded')),
  detail     jsonb not null default '{}'::jsonb,   -- incl. attachment sha256s at that moment
  actor_id   uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_comm_events_pack on communication_events (pack_id, created_at);
alter table communication_events enable row level security;
-- reject_mutation() created in 20260711_commercial_foundation.sql.
drop trigger if exists communication_events_immutable on communication_events;
create trigger communication_events_immutable
  before update or delete on communication_events
  for each row execute function public.reject_mutation();

-- ─────────────────────────────────────────────────────────────
-- 5. Numbering: FBA-COM-YYYY-NNNN.
-- ─────────────────────────────────────────────────────────────
create sequence if not exists communication_number_seq;

create or replace function public.next_communication_number()
returns text language sql security definer set search_path to 'public' as $$
  select 'FBA-COM-' || to_char(now(),'YYYY') || '-' || lpad(nextval('communication_number_seq')::text, 4, '0')
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. Atomic pack state changes.
--    Every transition appends a communication_events row in the
--    same transaction; nothing is ever edited in place afterwards.
-- ─────────────────────────────────────────────────────────────
create or replace function public.mark_pack_downloaded(
  p_pack_id uuid, p_actor uuid, p_detail jsonb
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_pack communication_packs%rowtype;
begin
  select * into v_pack from communication_packs where id = p_pack_id for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_pack.status = 'superseded' then
    return jsonb_build_object('ok',false,'error','superseded');
  end if;
  if v_pack.status = 'prepared' then
    update communication_packs set status = 'downloaded', updated_at = now() where id = p_pack_id;
  end if;
  insert into communication_events(pack_id, event, detail, actor_id)
    values (p_pack_id, 'downloaded', coalesce(p_detail,'{}'::jsonb), p_actor);
  return jsonb_build_object('ok',true,'status','downloaded');
end $$;

create or replace function public.mark_pack_sent(
  p_pack_id uuid, p_actor uuid, p_sent_via text, p_note text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_pack communication_packs%rowtype;
begin
  select * into v_pack from communication_packs where id = p_pack_id for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_pack.status not in ('prepared','downloaded','needs_attention') then
    return jsonb_build_object('ok',false,'error','bad_status','status',v_pack.status);
  end if;
  update communication_packs set
    status = 'marked_sent',
    sent_via = p_sent_via,
    marked_sent_by = p_actor,
    marked_sent_at = now(),
    updated_at = now()
  where id = p_pack_id;
  insert into communication_events(pack_id, event, detail, actor_id)
    values (p_pack_id, 'marked_sent',
            jsonb_build_object('sent_via', p_sent_via, 'note', p_note), p_actor);
  return jsonb_build_object('ok',true,'status','marked_sent');
end $$;

create or replace function public.mark_pack_needs_attention(
  p_pack_id uuid, p_actor uuid, p_note text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_pack communication_packs%rowtype;
begin
  select * into v_pack from communication_packs where id = p_pack_id for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_pack.status = 'superseded' then
    return jsonb_build_object('ok',false,'error','superseded');
  end if;
  update communication_packs set
    status = 'needs_attention', attention_note = p_note, updated_at = now()
  where id = p_pack_id;
  insert into communication_events(pack_id, event, detail, actor_id)
    values (p_pack_id, 'needs_attention', jsonb_build_object('note', p_note), p_actor);
  return jsonb_build_object('ok',true,'status','needs_attention');
end $$;

-- Point an old pack at its replacement (called after the new pack row
-- has been inserted by the app). Marks old superseded + logs on both.
create or replace function public.supersede_pack(
  p_old uuid, p_new uuid, p_actor uuid
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_old communication_packs%rowtype;
begin
  select * into v_old from communication_packs where id = p_old for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_old.status = 'superseded' then
    return jsonb_build_object('ok',false,'error','already_superseded');
  end if;
  perform 1 from communication_packs where id = p_new;
  if not found then return jsonb_build_object('ok',false,'error','new_not_found'); end if;
  update communication_packs set
    status = 'superseded', superseded_by_id = p_new, updated_at = now()
  where id = p_old;
  insert into communication_events(pack_id, event, detail, actor_id)
    values (p_old, 'superseded', jsonb_build_object('superseded_by', p_new), p_actor);
  insert into communication_events(pack_id, event, detail, actor_id)
    values (p_new, 're_prepared', jsonb_build_object('supersedes', p_old), p_actor);
  return jsonb_build_object('ok',true,'status','superseded');
end $$;

-- ─────────────────────────────────────────────────────────────
-- 7. Private Storage bucket for generated PDFs. No storage.objects
--    policies: anon/authenticated have no access; the app uses the
--    service-role client + short-lived signed URLs only.
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('issued-documents', 'issued-documents', false, 20971520, array['application/pdf'])
  on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 8. Seed default templates (idempotent — only when the key has no
--    row yet). Plain text; {{variables}} rendered + escaped in app.
-- ─────────────────────────────────────────────────────────────
insert into communication_templates (template_key, label, audience, subject_template, body_template, variables)
select v.template_key, v.label, v.audience, v.subject_template, v.body_template, v.variables::jsonb
from (values
  ('quote_issue','Quote — issue','client',
   'Your quotation {{document_number}} from Full Bloom Artelier',
   E'Dear {{client_name}},\n\nThank you for the opportunity to prepare this quotation. Please find quotation {{document_number}} attached for your review.\n\nThe quotation is valid until {{valid_until}}. Do let us know if you would like to discuss any element of the specification.\n\nWith warm regards,\n{{company_name}}',
   '["client_name","document_number","valid_until","company_name"]'),
  ('proforma_issue','Pro forma — issue','client',
   'Pro forma invoice {{document_number}} — Full Bloom Artelier',
   E'Dear {{client_name}},\n\nPlease find attached pro forma invoice {{document_number}}.\n\nThe balance due is {{balance_due}}. Bank details for payment are included on the document.\n\nWith warm regards,\n{{company_name}}',
   '["client_name","document_number","balance_due","company_name"]'),
  ('acceptance_cover','Acceptance link — cover','client',
   'Please review and accept quotation {{document_number}}',
   E'Dear {{client_name}},\n\nQuotation {{document_number}} is ready for your review. You can view and formally accept it online here:\n\n{{confirmation_url}}\n\nThe attached PDF is for your records.\n\nWith warm regards,\n{{company_name}}',
   '["client_name","document_number","confirmation_url","company_name"]'),
  ('invoice_issue','Invoice — issue','client',
   'Invoice {{document_number}} from Full Bloom Artelier',
   E'Dear {{client_name}},\n\nPlease find attached invoice {{document_number}}, with a balance of {{balance_due}} due by {{due_date}}.\n\nBank details for payment are shown on the invoice. Thank you for your business.\n\nWith warm regards,\n{{company_name}}',
   '["client_name","document_number","balance_due","due_date","company_name"]'),
  ('payment_reminder_first','Payment reminder — first','client',
   'A gentle reminder: invoice {{document_number}}',
   E'Dear {{client_name}},\n\nThis is a friendly reminder that invoice {{document_number}}, with a balance of {{balance_due}}, was due on {{due_date}}.\n\nIf payment is already on its way, please disregard this note. A copy of the invoice is attached.\n\nWith warm regards,\n{{company_name}}',
   '["client_name","document_number","balance_due","due_date","company_name"]'),
  ('payment_reminder_second','Payment reminder — second','client',
   'Second reminder: invoice {{document_number}} now overdue',
   E'Dear {{client_name}},\n\nOur records show invoice {{document_number}} (balance {{balance_due}}), due {{due_date}}, remains unpaid.\n\nWe would be grateful for settlement at your earliest convenience. A copy is attached for reference.\n\nWith regards,\n{{company_name}}',
   '["client_name","document_number","balance_due","due_date","company_name"]'),
  ('payment_reminder_final','Payment reminder — final','client',
   'Final reminder: invoice {{document_number}}',
   E'Dear {{client_name}},\n\nDespite previous reminders, invoice {{document_number}} (balance {{balance_due}}) remains outstanding.\n\nPlease arrange settlement within 7 days to avoid further action. A copy of the invoice is attached.\n\nWith regards,\n{{company_name}}',
   '["client_name","document_number","balance_due","company_name"]'),
  ('receipt_issue','Receipt — issue','client',
   'Receipt {{document_number}} — payment received',
   E'Dear {{client_name}},\n\nThank you — we confirm receipt of your payment. Receipt {{document_number}} is attached for your records.\n\nWith warm regards,\n{{company_name}}',
   '["client_name","document_number","company_name"]'),
  ('credit_note_issue','Credit note — issue','client',
   'Credit note {{document_number}} from Full Bloom Artelier',
   E'Dear {{client_name}},\n\nPlease find attached credit note {{document_number}}.\n\nWith warm regards,\n{{company_name}}',
   '["client_name","document_number","company_name"]'),
  ('po_issue','Purchase order — to maker','manufacturer',
   'Purchase order {{document_number}} from Full Bloom Artelier',
   E'Dear {{recipient_name}},\n\nPlease find attached purchase order {{document_number}}. We would be grateful for your acknowledgement of the order and confirmation of the lead time.\n\nAcknowledge online here: {{confirmation_url}}\n\nWith thanks,\n{{company_name}}',
   '["recipient_name","document_number","confirmation_url","company_name"]'),
  ('po_revision','Purchase order — revision','manufacturer',
   'Revised purchase order {{document_number}}',
   E'Dear {{recipient_name}},\n\nPlease find attached a revised purchase order {{document_number}}, which supersedes the previous version. Kindly acknowledge the revised order.\n\nWith thanks,\n{{company_name}}',
   '["recipient_name","document_number","company_name"]'),
  ('delivery_note_cover','Delivery note + confirmation — cover','delivery_recipient',
   'Delivery {{document_number}} — Full Bloom Artelier',
   E'Dear {{recipient_name}},\n\nPlease find attached the delivery note for {{document_number}}. On receipt, kindly confirm delivery online here:\n\n{{confirmation_url}}\n\nWith thanks,\n{{company_name}}',
   '["recipient_name","document_number","confirmation_url","company_name"]'),
  ('backorder_notice','Backorder notice','client',
   'Update on your order — items to follow',
   E'Dear {{client_name}},\n\nWe wanted to update you: some items on your order are following in a later delivery. We will confirm the schedule shortly and keep you posted.\n\nWith warm regards,\n{{company_name}}',
   '["client_name","company_name"]')
) as v(template_key, label, audience, subject_template, body_template, variables)
where not exists (
  select 1 from communication_templates t where t.template_key = v.template_key
);

-- ─────────────────────────────────────────────────────────────
-- 9. SECURITY DEFINER lockdown — service_role only (matches
--    20260712_lock_down_definer_functions.sql).
-- ─────────────────────────────────────────────────────────────
do $$
declare
  fn text;
  sigs text[] := array[
    'public.next_communication_number()',
    'public.mark_pack_downloaded(uuid,uuid,jsonb)',
    'public.mark_pack_sent(uuid,uuid,text,text)',
    'public.mark_pack_needs_attention(uuid,uuid,text)',
    'public.supersede_pack(uuid,uuid,uuid)'
  ];
begin
  foreach fn in array sigs loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
