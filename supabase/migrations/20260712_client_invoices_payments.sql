-- ============================================================
-- FBA Commercial Pipeline — Sprint 3: Client Acceptance,
-- Payments, Dedicated Invoices and Credit Control.
--
-- Runs after 20260711_supplier_purchase_orders.sql (unmodified).
--
--  1) Settings: deposit basis, payment terms days, backdate approval
--  2) Client acceptance (commercial_acceptances + tokens; proforma status)
--  3) Dedicated sales_invoices + lines + immutable snapshots
--  4) payments + payment_allocations (ledger; balances derived)
--  5) credit_notes + lines + allocations + snapshots
--  6) payment_receipts (numbered, immutable)
--  7) Sequences + numbering (FBA-CN / FBA-RCPT; FBA-INV reused)
--  8) Atomic SQL functions: acceptance, payment allocate/reverse,
--     invoice issue, credit-note issue/allocate, PO acknowledgement
--     (Sprint 2 atomicity correction)
--  9) Immutability guard for issued invoices/credit notes
--
-- Non-destructive, idempotent, safe with existing data. No historic
-- payments or acceptances are fabricated (marked 'unknown').
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Settings additions (deposit basis + payment terms)
-- ─────────────────────────────────────────────────────────────
alter table commercial_settings
  add column if not exists default_deposit_basis          text not null default 'gross_total'
    check (default_deposit_basis in ('gross_total','net_subtotal')),
  add column if not exists default_payment_terms_days      integer not null default 30,
  add column if not exists payment_backdate_approval_days   integer not null default 7;

-- ─────────────────────────────────────────────────────────────
-- 2. Client acceptance status on the working commercial record
--    Historic rows are 'unknown' — acceptance is never inferred.
-- ─────────────────────────────────────────────────────────────
alter table proformas
  add column if not exists acceptance_status text not null default 'unknown'
    check (acceptance_status in ('unknown','not_sent','sent','viewed','accepted','declined','expired','superseded'));

create table if not exists commercial_acceptances (
  id                  uuid primary key default uuid_generate_v4(),
  proforma_id         uuid not null references proformas(id) on delete restrict,
  issued_document_id  uuid not null references issued_documents(id) on delete restrict,
  document_type       text not null,
  document_number     text not null,
  revision            integer not null,
  accepted_by_name    text not null,
  accepted_by_email   text not null,
  acceptance_method   text not null default 'secure_link'
    check (acceptance_method in ('secure_link','email_confirmation','signed_document','admin_recorded','other')),
  acceptance_notes    text,
  acceptance_evidence text,
  accepted_at         timestamptz not null default now(),
  ip_hash             text,
  user_agent          text,
  token_id            uuid,
  recorded_by         uuid references users(id) on delete set null,
  created_at          timestamptz not null default now()
);
-- One active acceptance per source revision.
create unique index if not exists uq_acceptance_source_revision
  on commercial_acceptances (issued_document_id, revision);
create index if not exists idx_acceptances_proforma on commercial_acceptances(proforma_id);
alter table commercial_acceptances enable row level security;

create table if not exists commercial_acceptance_tokens (
  id                 uuid primary key default uuid_generate_v4(),
  issued_document_id uuid not null references issued_documents(id) on delete cascade,
  proforma_id        uuid not null references proformas(id) on delete cascade,
  revision           integer not null,
  token_hash         text not null unique,       -- sha-256 hex; raw token never stored
  expires_at         timestamptz not null,
  revoked_at         timestamptz,
  first_viewed_at    timestamptz,
  used_at            timestamptz,
  created_by         uuid references users(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists idx_acceptance_tokens_doc on commercial_acceptance_tokens(issued_document_id);
alter table commercial_acceptance_tokens enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 3. Dedicated sales invoices (separate from proformas)
-- ─────────────────────────────────────────────────────────────
create sequence if not exists credit_note_number_seq;
create sequence if not exists receipt_number_seq;

create or replace function public.next_credit_note_number()
returns text language sql security definer set search_path to 'public' as $$
  select 'FBA-CN-' || to_char(now(),'YYYY') || '-' || lpad(nextval('credit_note_number_seq')::text, 4, '0')
$$;

create or replace function public.next_receipt_number()
returns text language sql security definer set search_path to 'public' as $$
  select 'FBA-RCPT-' || to_char(now(),'YYYY') || '-' || lpad(nextval('receipt_number_seq')::text, 4, '0')
$$;

create table if not exists sales_invoices (
  id                        uuid primary key default uuid_generate_v4(),
  invoice_number            text unique,               -- assigned only at issue
  invoice_type              text not null default 'final'
    check (invoice_type in ('deposit','stage','final','service','adjustment')),
  commercial_order_id       uuid references commercial_orders(id) on delete restrict,
  source_proforma_id        uuid references proformas(id) on delete set null,
  source_issued_document_id uuid references issued_documents(id) on delete set null,
  source_revision           integer,
  client_id                 uuid references users(id) on delete set null,
  project_id                uuid references projects(id) on delete set null,
  currency                  text not null default 'GBP',
  status                    text not null default 'draft'
    check (status in ('draft','pending_approval','approved','issued','partially_paid','paid','overdue','void','credited','cancelled')),
  issue_date                date,
  due_date                  date,
  tax_point_date            date,
  billing_address_snapshot  text,
  delivery_address_snapshot text,
  client_snapshot           jsonb,
  project_snapshot          jsonb,
  company_snapshot          jsonb,
  bank_snapshot             jsonb,
  payment_terms_snapshot    text,
  subtotal                  numeric not null default 0,
  tax_total                 numeric not null default 0,
  gross_total               numeric not null default 0,
  amount_paid               numeric not null default 0,   -- DERIVED from allocations
  credit_total              numeric not null default 0,   -- DERIVED from credit allocations
  balance_due               numeric not null default 0,   -- DERIVED
  approval_status           text not null default 'none'
    check (approval_status in ('none','required','approved')),
  approval_reason           text,
  approved_by               uuid references users(id) on delete set null,
  approved_at               timestamptz,
  locked_at                 timestamptz,
  issued_by                 uuid references users(id) on delete set null,
  issued_at                 timestamptz,
  voided_at                 timestamptz,
  void_reason               text,
  reminder_status           text not null default 'none'
    check (reminder_status in ('none','first_sent','second_sent','final_sent')),
  created_by                uuid references users(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists idx_sales_invoices_order  on sales_invoices(commercial_order_id);
create index if not exists idx_sales_invoices_client on sales_invoices(client_id);
create index if not exists idx_sales_invoices_status on sales_invoices(status);
create index if not exists idx_sales_invoices_due    on sales_invoices(due_date);
alter table sales_invoices enable row level security;

create table if not exists sales_invoice_lines (
  id                     uuid primary key default uuid_generate_v4(),
  sales_invoice_id       uuid not null references sales_invoices(id) on delete cascade,
  source_line_item_id    uuid references proforma_line_items(id) on delete set null,
  line_type              text not null default 'product',
  product_id             uuid references products(id) on delete set null,
  service_catalogue_id   uuid references service_catalogue(id) on delete set null,
  name_snapshot          text not null,
  description_snapshot    text,
  specification_snapshot text,
  quantity               numeric not null default 1 check (quantity > 0),
  unit_of_measure        text not null default 'each',
  unit_price             numeric not null default 0,      -- CLIENT selling price (no supplier cost/margin)
  discount_amount        numeric not null default 0,
  tax_category           text not null default 'standard'
    check (tax_category in ('standard','reduced','zero','exempt','outside_scope')),
  tax_rate_snapshot      numeric,
  line_net_total         numeric not null default 0,
  line_tax_total         numeric not null default 0,
  line_gross_total       numeric not null default 0,
  sort_order             integer not null default 0,
  created_at             timestamptz not null default now()
);
create index if not exists idx_sales_invoice_lines_inv on sales_invoice_lines(sales_invoice_id);
alter table sales_invoice_lines enable row level security;

create table if not exists sales_invoice_snapshots (
  id               uuid primary key default uuid_generate_v4(),
  sales_invoice_id uuid not null references sales_invoices(id) on delete cascade,
  invoice_number   text not null,
  snapshot         jsonb not null,
  issued_by        uuid references users(id) on delete set null,
  issued_at        timestamptz not null default now(),
  unique (sales_invoice_id)
);
alter table sales_invoice_snapshots enable row level security;
drop trigger if exists sales_invoice_snapshots_immutable on sales_invoice_snapshots;
create trigger sales_invoice_snapshots_immutable
  before update or delete on sales_invoice_snapshots
  for each row execute function public.reject_mutation();

-- Guard: once issued (locked_at set), only derived/status/void fields may change.
create or replace function public.guard_issued_invoice()
returns trigger language plpgsql as $$
begin
  if OLD.locked_at is not null then
    if NEW.invoice_number   is distinct from OLD.invoice_number
    or NEW.invoice_type     is distinct from OLD.invoice_type
    or NEW.subtotal         is distinct from OLD.subtotal
    or NEW.tax_total        is distinct from OLD.tax_total
    or NEW.gross_total      is distinct from OLD.gross_total
    or NEW.currency         is distinct from OLD.currency
    or NEW.issue_date       is distinct from OLD.issue_date
    or NEW.due_date         is distinct from OLD.due_date
    or NEW.client_snapshot  is distinct from OLD.client_snapshot
    or NEW.company_snapshot is distinct from OLD.company_snapshot
    or NEW.bank_snapshot    is distinct from OLD.bank_snapshot then
      raise exception 'Issued invoice % is immutable; use void / credit note / replacement.', OLD.invoice_number;
    end if;
  end if;
  return NEW;
end;
$$;
drop trigger if exists sales_invoices_guard on sales_invoices;
create trigger sales_invoices_guard
  before update on sales_invoices
  for each row execute function public.guard_issued_invoice();

-- ─────────────────────────────────────────────────────────────
-- 4. Payments + allocations (ledger; invoice balances derived)
-- ─────────────────────────────────────────────────────────────
create table if not exists payments (
  id                  uuid primary key default uuid_generate_v4(),
  payment_reference   text not null unique,        -- FBA-PAY-YYYY-xxxx (app or fn assigned)
  client_id           uuid references users(id) on delete set null,
  commercial_order_id uuid references commercial_orders(id) on delete set null,
  currency            text not null default 'GBP',
  amount              numeric not null check (amount > 0),
  payment_date        date not null default current_date,
  payment_method      text not null default 'bank_transfer'
    check (payment_method in ('bank_transfer','card','cash','cheque','credit','other')),
  external_reference  text,
  bank_reference      text,
  status              text not null default 'pending'
    check (status in ('pending','confirmed','reversed','refunded','failed')),
  notes               text,
  recorded_by         uuid references users(id) on delete set null,
  approved_by         uuid references users(id) on delete set null,
  confirmed_at        timestamptz,
  reversed_at         timestamptz,
  reversal_reason     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_payments_client on payments(client_id);
create index if not exists idx_payments_order  on payments(commercial_order_id);
create index if not exists idx_payments_status on payments(status);
alter table payments enable row level security;

create table if not exists payment_allocations (
  id               uuid primary key default uuid_generate_v4(),
  payment_id       uuid not null references payments(id) on delete cascade,
  sales_invoice_id uuid not null references sales_invoices(id) on delete restrict,
  amount           numeric not null check (amount > 0),
  allocated_by     uuid references users(id) on delete set null,
  allocated_at     timestamptz not null default now()
);
create index if not exists idx_payment_allocations_payment on payment_allocations(payment_id);
create index if not exists idx_payment_allocations_invoice on payment_allocations(sales_invoice_id);
alter table payment_allocations enable row level security;

create table if not exists payment_receipts (
  id             uuid primary key default uuid_generate_v4(),
  receipt_number text not null unique,
  payment_id     uuid not null references payments(id) on delete cascade,
  snapshot       jsonb not null,
  issued_by      uuid references users(id) on delete set null,
  issued_at      timestamptz not null default now()
);
alter table payment_receipts enable row level security;
drop trigger if exists payment_receipts_immutable on payment_receipts;
create trigger payment_receipts_immutable
  before update or delete on payment_receipts
  for each row execute function public.reject_mutation();

-- ─────────────────────────────────────────────────────────────
-- 5. Credit notes
-- ─────────────────────────────────────────────────────────────
create table if not exists credit_notes (
  id                uuid primary key default uuid_generate_v4(),
  credit_note_number text unique,                  -- assigned at issue
  sales_invoice_id  uuid not null references sales_invoices(id) on delete restrict,
  client_id         uuid references users(id) on delete set null,
  currency          text not null default 'GBP',
  status            text not null default 'draft'
    check (status in ('draft','pending_approval','approved','issued','allocated','void')),
  reason            text,
  subtotal          numeric not null default 0,
  tax_total         numeric not null default 0,
  gross_total       numeric not null default 0,
  allocated_total   numeric not null default 0,     -- DERIVED
  approval_status   text not null default 'none'
    check (approval_status in ('none','required','approved')),
  approved_by       uuid references users(id) on delete set null,
  approved_at       timestamptz,
  locked_at         timestamptz,
  issued_by         uuid references users(id) on delete set null,
  issued_at         timestamptz,
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_credit_notes_invoice on credit_notes(sales_invoice_id);
create index if not exists idx_credit_notes_status  on credit_notes(status);
alter table credit_notes enable row level security;

create table if not exists credit_note_lines (
  id             uuid primary key default uuid_generate_v4(),
  credit_note_id uuid not null references credit_notes(id) on delete cascade,
  source_invoice_line_id uuid references sales_invoice_lines(id) on delete set null,
  name_snapshot  text not null,
  description_snapshot text,
  quantity       numeric not null default 1,
  unit_price     numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_category   text not null default 'standard'
    check (tax_category in ('standard','reduced','zero','exempt','outside_scope')),
  tax_rate_snapshot numeric,
  line_net_total numeric not null default 0,
  line_tax_total numeric not null default 0,
  line_gross_total numeric not null default 0,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists idx_credit_note_lines_cn on credit_note_lines(credit_note_id);
alter table credit_note_lines enable row level security;

create table if not exists credit_note_allocations (
  id               uuid primary key default uuid_generate_v4(),
  credit_note_id   uuid not null references credit_notes(id) on delete cascade,
  sales_invoice_id uuid not null references sales_invoices(id) on delete restrict,
  amount           numeric not null check (amount > 0),
  allocated_by     uuid references users(id) on delete set null,
  allocated_at     timestamptz not null default now()
);
create index if not exists idx_cn_allocations_cn  on credit_note_allocations(credit_note_id);
create index if not exists idx_cn_allocations_inv on credit_note_allocations(sales_invoice_id);
alter table credit_note_allocations enable row level security;

create table if not exists credit_note_snapshots (
  id             uuid primary key default uuid_generate_v4(),
  credit_note_id uuid not null references credit_notes(id) on delete cascade,
  credit_note_number text not null,
  snapshot       jsonb not null,
  issued_by      uuid references users(id) on delete set null,
  issued_at      timestamptz not null default now(),
  unique (credit_note_id)
);
alter table credit_note_snapshots enable row level security;
drop trigger if exists credit_note_snapshots_immutable on credit_note_snapshots;
create trigger credit_note_snapshots_immutable
  before update or delete on credit_note_snapshots
  for each row execute function public.reject_mutation();

-- ─────────────────────────────────────────────────────────────
-- 6. Derived-financials recompute (single source of truth)
-- ─────────────────────────────────────────────────────────────
create or replace function public.recompute_invoice_financials(p_invoice_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_paid    numeric := 0;
  v_credit  numeric := 0;
  v_gross   numeric := 0;
  v_locked  timestamptz;
  v_due     date;
  v_status  text;
  v_void    timestamptz;
begin
  select gross_total, locked_at, due_date, status, voided_at
    into v_gross, v_locked, v_due, v_status, v_void
    from sales_invoices where id = p_invoice_id;
  if not found then return; end if;

  select coalesce(sum(pa.amount),0) into v_paid
    from payment_allocations pa
    join payments p on p.id = pa.payment_id
    where pa.sales_invoice_id = p_invoice_id and p.status = 'confirmed';

  select coalesce(sum(ca.amount),0) into v_credit
    from credit_note_allocations ca
    join credit_notes cn on cn.id = ca.credit_note_id
    where ca.sales_invoice_id = p_invoice_id and cn.status in ('issued','allocated');

  -- Preserve terminal/manual states; derive the money statuses only.
  if v_void is not null or v_status in ('void','cancelled','draft','pending_approval','approved') then
    update sales_invoices set amount_paid = v_paid, credit_total = v_credit,
      balance_due = round(v_gross - v_paid - v_credit, 2), updated_at = now()
      where id = p_invoice_id;
    return;
  end if;

  update sales_invoices set
    amount_paid = v_paid,
    credit_total = v_credit,
    balance_due = round(v_gross - v_paid - v_credit, 2),
    status = case
      when round(v_gross - v_paid - v_credit, 2) <= 0 and v_gross > 0 then
        (case when v_credit > 0 and v_paid = 0 then 'credited' else 'paid' end)
      when v_paid > 0 or v_credit > 0 then 'partially_paid'
      when v_locked is not null and v_due is not null and v_due < current_date then 'overdue'
      else status
    end,
    updated_at = now()
  where id = p_invoice_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. Atomic client acceptance
-- ─────────────────────────────────────────────────────────────
create or replace function public.accept_commercial_document(
  p_token_hash text, p_action text, p_name text, p_email text,
  p_note text, p_ip_hash text, p_user_agent text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_tok  commercial_acceptance_tokens%rowtype;
  v_doc  issued_documents%rowtype;
  v_acc_id uuid;
begin
  select * into v_tok from commercial_acceptance_tokens where token_hash = p_token_hash for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_tok.revoked_at is not null then return jsonb_build_object('ok',false,'error','revoked'); end if;
  if v_tok.used_at is not null then return jsonb_build_object('ok',false,'error','used'); end if;
  if v_tok.expires_at < now() then return jsonb_build_object('ok',false,'error','expired'); end if;

  select * into v_doc from issued_documents where id = v_tok.issued_document_id;
  if not found then return jsonb_build_object('ok',false,'error','doc_missing'); end if;

  update commercial_acceptance_tokens set used_at = now() where id = v_tok.id;

  if p_action = 'decline' then
    update proformas set acceptance_status = 'declined' where id = v_tok.proforma_id;
    return jsonb_build_object('ok',true,'action','decline','proforma_id',v_tok.proforma_id);
  end if;

  insert into commercial_acceptances(
    proforma_id, issued_document_id, document_type, document_number, revision,
    accepted_by_name, accepted_by_email, acceptance_method, acceptance_notes,
    ip_hash, user_agent, token_id
  ) values (
    v_tok.proforma_id, v_tok.issued_document_id, v_doc.doc_type, v_doc.document_number, v_tok.revision,
    p_name, p_email, 'secure_link', p_note, p_ip_hash, p_user_agent, v_tok.id
  )
  on conflict (issued_document_id, revision) do nothing
  returning id into v_acc_id;

  if v_acc_id is null then return jsonb_build_object('ok',false,'error','already_accepted'); end if;

  update proformas set acceptance_status = 'accepted' where id = v_tok.proforma_id;
  return jsonb_build_object('ok',true,'action','accept','acceptance_id',v_acc_id,'proforma_id',v_tok.proforma_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 8. Atomic payment allocation + reversal
-- ─────────────────────────────────────────────────────────────
create or replace function public.allocate_payment(
  p_payment_id uuid, p_invoice_id uuid, p_amount numeric, p_actor uuid
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_pay      payments%rowtype;
  v_inv      sales_invoices%rowtype;
  v_alloc    numeric;
  v_pay_free numeric;
  v_inv_out  numeric;
begin
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('ok',false,'error','bad_amount'); end if;
  select * into v_pay from payments where id = p_payment_id for update;
  if not found then return jsonb_build_object('ok',false,'error','payment_not_found'); end if;
  if v_pay.status <> 'confirmed' then return jsonb_build_object('ok',false,'error','payment_not_confirmed'); end if;

  select * into v_inv from sales_invoices where id = p_invoice_id for update;
  if not found then return jsonb_build_object('ok',false,'error','invoice_not_found'); end if;
  if v_inv.locked_at is null then return jsonb_build_object('ok',false,'error','invoice_not_issued'); end if;
  if v_pay.currency <> v_inv.currency then return jsonb_build_object('ok',false,'error','currency_mismatch'); end if;

  select coalesce(sum(amount),0) into v_alloc from payment_allocations where payment_id = p_payment_id;
  v_pay_free := v_pay.amount - v_alloc;
  if p_amount > v_pay_free + 0.0001 then return jsonb_build_object('ok',false,'error','exceeds_payment_balance','available',v_pay_free); end if;

  v_inv_out := v_inv.gross_total - v_inv.amount_paid - v_inv.credit_total;
  if p_amount > v_inv_out + 0.0001 then return jsonb_build_object('ok',false,'error','exceeds_invoice_balance','available',v_inv_out); end if;

  insert into payment_allocations(payment_id, sales_invoice_id, amount, allocated_by)
    values (p_payment_id, p_invoice_id, round(p_amount,2), p_actor);

  perform public.recompute_invoice_financials(p_invoice_id);
  return jsonb_build_object('ok',true,'allocated',round(p_amount,2));
end;
$$;

create or replace function public.reverse_payment(
  p_payment_id uuid, p_actor uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  perform 1 from payments where id = p_payment_id for update;
  if not found then return jsonb_build_object('ok',false,'error','payment_not_found'); end if;

  update payments set status='reversed', reversed_at=now(), reversal_reason=p_reason, updated_at=now()
    where id = p_payment_id;

  for r in select distinct sales_invoice_id from payment_allocations where payment_id = p_payment_id loop
    delete from payment_allocations where payment_id = p_payment_id and sales_invoice_id = r.sales_invoice_id;
    perform public.recompute_invoice_financials(r.sales_invoice_id);
  end loop;

  return jsonb_build_object('ok',true);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 9. Atomic invoice issue (assign number, snapshot, lock)
-- ─────────────────────────────────────────────────────────────
create or replace function public.issue_sales_invoice(
  p_invoice_id uuid, p_snapshot jsonb, p_actor uuid
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_inv sales_invoices%rowtype;
  v_num text;
  v_snapfinal jsonb;
begin
  select * into v_inv from sales_invoices where id = p_invoice_id for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_inv.locked_at is not null then return jsonb_build_object('ok',false,'error','already_issued'); end if;
  if v_inv.approval_status = 'required' then return jsonb_build_object('ok',false,'error','approval_required'); end if;

  v_num := coalesce(v_inv.invoice_number, public.next_invoice_number());
  v_snapfinal := jsonb_set(p_snapshot, '{invoice_number}', to_jsonb(v_num), true);

  update sales_invoices set
    invoice_number = v_num, status='issued', locked_at=now(),
    issued_by=p_actor, issued_at=now(),
    issue_date = coalesce(issue_date, current_date),
    balance_due = gross_total - amount_paid - credit_total,
    updated_at=now()
  where id = p_invoice_id;

  insert into sales_invoice_snapshots(sales_invoice_id, invoice_number, snapshot, issued_by)
    values (p_invoice_id, v_num, v_snapfinal, p_actor)
    on conflict (sales_invoice_id) do nothing;

  return jsonb_build_object('ok',true,'invoice_number',v_num);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 10. Atomic credit-note issue + allocation
-- ─────────────────────────────────────────────────────────────
create or replace function public.issue_credit_note(
  p_credit_note_id uuid, p_snapshot jsonb, p_actor uuid
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_cn credit_notes%rowtype; v_num text; v_snapfinal jsonb;
begin
  select * into v_cn from credit_notes where id = p_credit_note_id for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_cn.locked_at is not null then return jsonb_build_object('ok',false,'error','already_issued'); end if;
  if v_cn.approval_status <> 'approved' then return jsonb_build_object('ok',false,'error','approval_required'); end if;

  v_num := coalesce(v_cn.credit_note_number, public.next_credit_note_number());
  v_snapfinal := jsonb_set(p_snapshot, '{credit_note_number}', to_jsonb(v_num), true);

  update credit_notes set credit_note_number=v_num, status='issued', locked_at=now(),
    issued_by=p_actor, issued_at=now(), updated_at=now() where id=p_credit_note_id;

  insert into credit_note_snapshots(credit_note_id, credit_note_number, snapshot, issued_by)
    values (p_credit_note_id, v_num, v_snapfinal, p_actor)
    on conflict (credit_note_id) do nothing;

  return jsonb_build_object('ok',true,'credit_note_number',v_num);
end;
$$;

create or replace function public.allocate_credit_note(
  p_credit_note_id uuid, p_invoice_id uuid, p_amount numeric, p_actor uuid
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_cn credit_notes%rowtype; v_inv sales_invoices%rowtype;
  v_alloc numeric; v_cn_free numeric; v_inv_out numeric;
begin
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('ok',false,'error','bad_amount'); end if;
  select * into v_cn from credit_notes where id = p_credit_note_id for update;
  if not found then return jsonb_build_object('ok',false,'error','cn_not_found'); end if;
  if v_cn.status not in ('issued','allocated') then return jsonb_build_object('ok',false,'error','cn_not_issued'); end if;

  select * into v_inv from sales_invoices where id = p_invoice_id for update;
  if not found then return jsonb_build_object('ok',false,'error','invoice_not_found'); end if;
  if v_inv.locked_at is null then return jsonb_build_object('ok',false,'error','invoice_not_issued'); end if;
  if v_cn.currency <> v_inv.currency then return jsonb_build_object('ok',false,'error','currency_mismatch'); end if;

  select coalesce(sum(amount),0) into v_alloc from credit_note_allocations where credit_note_id = p_credit_note_id;
  v_cn_free := v_cn.gross_total - v_alloc;
  if p_amount > v_cn_free + 0.0001 then return jsonb_build_object('ok',false,'error','exceeds_credit_balance','available',v_cn_free); end if;

  v_inv_out := v_inv.gross_total - v_inv.amount_paid - v_inv.credit_total;
  if p_amount > v_inv_out + 0.0001 then return jsonb_build_object('ok',false,'error','exceeds_invoice_balance','available',v_inv_out); end if;

  insert into credit_note_allocations(credit_note_id, sales_invoice_id, amount, allocated_by)
    values (p_credit_note_id, p_invoice_id, round(p_amount,2), p_actor);

  update credit_notes set allocated_total = v_alloc + round(p_amount,2),
    status = case when v_alloc + round(p_amount,2) >= v_cn.gross_total then 'allocated' else status end,
    updated_at = now() where id = p_credit_note_id;

  perform public.recompute_invoice_financials(p_invoice_id);
  return jsonb_build_object('ok',true,'allocated',round(p_amount,2));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 11. Sprint 2 correction: atomic supplier PO acknowledgement
-- ─────────────────────────────────────────────────────────────
create or replace function public.acknowledge_purchase_order(
  p_token_hash text, p_action text, p_name text, p_email text,
  p_note text, p_expected date
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_tok purchase_order_ack_tokens%rowtype; v_po purchase_orders%rowtype;
begin
  select * into v_tok from purchase_order_ack_tokens where token_hash = p_token_hash for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_tok.revoked_at is not null then return jsonb_build_object('ok',false,'error','revoked'); end if;
  if v_tok.used_at is not null then return jsonb_build_object('ok',false,'error','used'); end if;
  if v_tok.expires_at < now() then return jsonb_build_object('ok',false,'error','expired'); end if;

  select * into v_po from purchase_orders where id = v_tok.purchase_order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','po_missing'); end if;
  if v_po.status = 'cancelled' then return jsonb_build_object('ok',false,'error','cancelled'); end if;
  if v_po.acknowledged_at is not null then return jsonb_build_object('ok',false,'error','already_acknowledged'); end if;

  update purchase_order_ack_tokens set used_at = now() where id = v_tok.id;

  if p_action = 'amend' then
    update purchase_orders set status='supplier_amendment_requested',
      acknowledgement_notes = coalesce(p_note,'Amendment requested'), updated_at=now()
      where id = v_po.id;
    return jsonb_build_object('ok',true,'action','amend','po_id',v_po.id);
  end if;

  update purchase_orders set status='acknowledged', acknowledged_by_name=p_name,
    acknowledged_by_email=p_email, acknowledged_at=now(), acknowledgement_notes=p_note,
    expected_completion_date=p_expected, updated_at=now() where id = v_po.id;
  return jsonb_build_object('ok',true,'action','accept','po_id',v_po.id);
end;
$$;
