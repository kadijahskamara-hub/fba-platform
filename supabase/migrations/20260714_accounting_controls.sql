-- ============================================================
-- FBA Commercial Pipeline — Sprint 6: Accounting Controls,
-- Credit Notes, Refunds, Period Locking & Exports.
--
-- Runs after 20260714_documents_communications.sql (Sprint 5).
-- Builds on Sprint 3 (credit_notes/payments/sales_invoices +
-- recompute_invoice_financials/guard_issued_invoice/issue_* fns)
-- and Sprint 4 (delivery_line_exceptions). Completes & controls
-- that machinery — does NOT rebuild it.
--
-- HOUSE RULES: RLS on every table (service-role only, no policies);
-- SECURITY DEFINER fns revoked to service_role; immutability via
-- reject_mutation; period locks enforced in SQL (fns + trigger),
-- never UI-only; never fabricate historic data (existing rows get
-- 'not_exported', periods start empty). Non-destructive, idempotent.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Reconciliation + accounting columns on existing tables.
--    Existing rows default to 'not_exported' (no fabricated state).
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['sales_invoices','credit_notes','payments'] loop
    execute format($f$
      alter table %I
        add column if not exists reconciliation_status text not null default 'not_exported'
          check (reconciliation_status in ('not_exported','exported','reconciled','needs_re_export','excluded')),
        add column if not exists export_run_id uuid,
        add column if not exists reconciled_by uuid references users(id) on delete set null,
        add column if not exists reconciled_at timestamptz,
        add column if not exists reconciliation_note text
    $f$, t);
  end loop;
end $$;

-- sales_invoices: extend void/replacement fields (void_reason/voided_at exist).
alter table sales_invoices
  add column if not exists replaced_by_invoice_id uuid references sales_invoices(id) on delete set null,
  add column if not exists replaces_invoice_id    uuid references sales_invoices(id) on delete set null;

-- credit_notes: void fields, source exception link, tax point.
alter table credit_notes
  add column if not exists voided_at         timestamptz,
  add column if not exists void_reason       text,
  add column if not exists voided_by         uuid references users(id) on delete set null,
  add column if not exists source_exception_id uuid references delivery_line_exceptions(id) on delete set null,
  add column if not exists tax_point_date    date;

-- ─────────────────────────────────────────────────────────────
-- 2. Duplicate-invoice prevention: at most one non-void invoice
--    per (source proforma, revision, invoice_type).
-- ─────────────────────────────────────────────────────────────
create unique index if not exists uq_invoice_per_source
  on sales_invoices (source_proforma_id, source_revision, invoice_type)
  where status not in ('void','cancelled') and source_proforma_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 3. accounting_periods (VAT-aligned; no date-range overlap).
-- ─────────────────────────────────────────────────────────────
create table if not exists accounting_periods (
  id            uuid primary key default uuid_generate_v4(),
  label         text not null unique,          -- e.g. '2026-Q3'
  starts_on     date not null,
  ends_on       date not null,
  status        text not null default 'open' check (status in ('open','closed')),
  closed_by     uuid references users(id) on delete set null,
  closed_at     timestamptz,
  reopened_by   uuid references users(id) on delete set null,
  reopened_at   timestamptz,
  reopen_reason text,
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint chk_period_dates check (ends_on >= starts_on),
  constraint no_period_overlap exclude using gist (daterange(starts_on, ends_on, '[]') with &&)
);
alter table accounting_periods enable row level security;

-- Is a given tax-point date inside a CLOSED period?
create or replace function public.is_period_locked(p_date date)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from accounting_periods
    where status = 'closed' and p_date is not null
      and p_date between starts_on and ends_on
  )
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. refunds (against a payment OR an unallocated credit note).
-- ─────────────────────────────────────────────────────────────
create sequence if not exists refund_number_seq;
create sequence if not exists export_run_seq;

create or replace function public.next_refund_number()
returns text language sql security definer set search_path to 'public' as $$
  select 'FBA-RFD-' || to_char(now(),'YYYY') || '-' || lpad(nextval('refund_number_seq')::text, 4, '0')
$$;
create or replace function public.next_export_number()
returns text language sql security definer set search_path to 'public' as $$
  select 'FBA-EXP-' || to_char(now(),'YYYY') || '-' || lpad(nextval('export_run_seq')::text, 4, '0')
$$;

create table if not exists refunds (
  id                  uuid primary key default uuid_generate_v4(),
  refund_number       text not null unique,          -- FBA-RFD-YYYY-NNNN
  payment_id          uuid references payments(id) on delete restrict,
  credit_note_id      uuid references credit_notes(id) on delete restrict,
  sales_invoice_id    uuid references sales_invoices(id) on delete set null,   -- context only
  client_id           uuid references users(id) on delete set null,
  currency            text not null default 'GBP',
  amount              numeric not null check (amount > 0),
  refund_date         date not null default current_date,
  method              text not null default 'bank_transfer' check (method in ('bank_transfer','card','cash','other')),
  external_reference  text,
  reason              text,
  status              text not null default 'pending' check (status in ('pending','approved','completed','cancelled')),
  recorded_by         uuid references users(id) on delete set null,
  approved_by         uuid references users(id) on delete set null,
  approved_at         timestamptz,
  completed_at        timestamptz,
  cancelled_reason    text,
  -- reconciliation columns (mirrors the shared set above)
  reconciliation_status text not null default 'not_exported'
    check (reconciliation_status in ('not_exported','exported','reconciled','needs_re_export','excluded')),
  export_run_id       uuid,
  reconciled_by       uuid references users(id) on delete set null,
  reconciled_at       timestamptz,
  reconciliation_note text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint chk_refund_single_source check (
    (payment_id is not null and credit_note_id is null) or
    (payment_id is null and credit_note_id is not null)),
  constraint chk_refund_approver_distinct check (approved_by is null or approved_by <> recorded_by)
);
create index if not exists idx_refunds_payment on refunds(payment_id);
create index if not exists idx_refunds_credit_note on refunds(credit_note_id);
create index if not exists idx_refunds_status on refunds(status);
alter table refunds enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 5. export_runs (immutable record of an accounting export).
-- ─────────────────────────────────────────────────────────────
create table if not exists export_runs (
  id            uuid primary key default uuid_generate_v4(),
  run_number    text not null unique,          -- FBA-EXP-YYYY-NNNN
  adapter       text not null check (adapter in ('xero','quickbooks','sage','generic')),
  scope         jsonb not null default '{}'::jsonb,   -- {from,to,period_id,doc_types}
  row_counts    jsonb not null default '{}'::jsonb,
  totals        jsonb not null default '{}'::jsonb,
  storage_paths jsonb not null default '{}'::jsonb,   -- one CSV per doc type
  sha256s       jsonb not null default '{}'::jsonb,
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now()
);
alter table export_runs enable row level security;
drop trigger if exists export_runs_immutable on export_runs;
create trigger export_runs_immutable
  before update or delete on export_runs
  for each row execute function public.reject_mutation();

-- ─────────────────────────────────────────────────────────────
-- 6. account_code_mappings (one row per adapter; UK defaults).
-- ─────────────────────────────────────────────────────────────
create table if not exists account_code_mappings (
  id               uuid primary key default uuid_generate_v4(),
  adapter          text not null unique check (adapter in ('xero','quickbooks','sage','generic')),
  sales_account    text not null,
  debtors_account  text not null,
  rounding_account text,
  bank_account     text,
  -- per tax-category → { code, rate }
  vat_codes        jsonb not null default '{}'::jsonb,
  updated_by       uuid references users(id) on delete set null,
  updated_at       timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
alter table account_code_mappings enable row level security;

insert into account_code_mappings (adapter, sales_account, debtors_account, rounding_account, bank_account, vat_codes)
select * from (values
  ('xero',       '200', '610', '860', '090',
    '{"standard":{"code":"OUTPUT2","rate":20},"reduced":{"code":"RROUTPUT","rate":5},"zero":{"code":"ZERORATEDOUTPUT","rate":0},"exempt":{"code":"EXEMPTOUTPUT","rate":0},"outside_scope":{"code":"NONE","rate":0}}'::jsonb),
  ('quickbooks', 'Sales', 'Debtors', 'Rounding', 'Business Bank Account',
    '{"standard":{"code":"20.0% S","rate":20},"reduced":{"code":"5.0% R","rate":5},"zero":{"code":"0.0% Z","rate":0},"exempt":{"code":"Exempt","rate":0},"outside_scope":{"code":"No VAT","rate":0}}'::jsonb),
  ('sage',       '4000', '1100', '4009', '1200',
    '{"standard":{"code":"T1","rate":20},"reduced":{"code":"T5","rate":5},"zero":{"code":"T0","rate":0},"exempt":{"code":"T2","rate":0},"outside_scope":{"code":"T9","rate":0}}'::jsonb),
  ('generic',    'SALES', 'DEBTORS', 'ROUNDING', 'BANK',
    '{"standard":{"code":"STD","rate":20},"reduced":{"code":"RED","rate":5},"zero":{"code":"ZERO","rate":0},"exempt":{"code":"EXEMPT","rate":0},"outside_scope":{"code":"OS","rate":0}}'::jsonb)
) as v(adapter, sales_account, debtors_account, rounding_account, bank_account, vat_codes)
where not exists (select 1 from account_code_mappings m where m.adapter = v.adapter);

-- ─────────────────────────────────────────────────────────────
-- 7. Period-lock guard trigger (backstop to the atomic fns).
--    Blocks financial mutation of any row whose tax point falls in
--    a closed period, and blocks creating/backdating financial rows
--    INTO a closed period. Reconciliation/export stamping is allowed.
-- ─────────────────────────────────────────────────────────────
create or replace function public.guard_locked_period()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  d_old date; d_new date; protected boolean := false;
begin
  if tg_table_name = 'sales_invoices' then
    d_new := coalesce(NEW.tax_point_date, NEW.issue_date);
    if tg_op = 'UPDATE' then
      d_old := coalesce(OLD.tax_point_date, OLD.issue_date);
      protected :=
        NEW.gross_total is distinct from OLD.gross_total
        or NEW.tax_total is distinct from OLD.tax_total
        or NEW.subtotal is distinct from OLD.subtotal
        or NEW.currency is distinct from OLD.currency
        or NEW.tax_point_date is distinct from OLD.tax_point_date
        or NEW.issue_date is distinct from OLD.issue_date
        or (NEW.voided_at is not null and OLD.voided_at is null)
        or (NEW.status in ('void','cancelled') and OLD.status not in ('void','cancelled'));
    end if;
  elsif tg_table_name = 'credit_notes' then
    d_new := coalesce(NEW.tax_point_date, NEW.issued_at::date, NEW.created_at::date);
    if tg_op = 'UPDATE' then
      d_old := coalesce(OLD.tax_point_date, OLD.issued_at::date, OLD.created_at::date);
      protected :=
        NEW.gross_total is distinct from OLD.gross_total
        or NEW.tax_total is distinct from OLD.tax_total
        or NEW.subtotal is distinct from OLD.subtotal
        or NEW.tax_point_date is distinct from OLD.tax_point_date
        or (NEW.voided_at is not null and OLD.voided_at is null)
        or (NEW.status = 'void' and OLD.status <> 'void')
        or (NEW.status = 'issued' and OLD.status <> 'issued');
    end if;
  elsif tg_table_name = 'payments' then
    d_new := NEW.payment_date;
    if tg_op = 'UPDATE' then
      d_old := OLD.payment_date;
      protected :=
        NEW.amount is distinct from OLD.amount
        or NEW.payment_date is distinct from OLD.payment_date
        or NEW.currency is distinct from OLD.currency
        or (NEW.status in ('reversed','refunded','failed') and OLD.status = 'confirmed');
    end if;
  elsif tg_table_name = 'refunds' then
    d_new := NEW.refund_date;
    if tg_op = 'UPDATE' then
      d_old := OLD.refund_date;
      protected :=
        NEW.amount is distinct from OLD.amount
        or NEW.refund_date is distinct from OLD.refund_date;
    end if;
  end if;

  if tg_op = 'INSERT' then
    if public.is_period_locked(d_new) then
      raise exception 'Cannot create % dated into a closed accounting period (%).', tg_table_name, d_new;
    end if;
  elsif tg_op = 'UPDATE' then
    if protected and (public.is_period_locked(d_old) or public.is_period_locked(d_new)) then
      raise exception 'Row is in a closed accounting period; financial changes are blocked (use a credit note).';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists guard_locked_period_si on sales_invoices;
create trigger guard_locked_period_si before insert or update on sales_invoices
  for each row execute function public.guard_locked_period();
drop trigger if exists guard_locked_period_cn on credit_notes;
create trigger guard_locked_period_cn before insert or update on credit_notes
  for each row execute function public.guard_locked_period();
drop trigger if exists guard_locked_period_pay on payments;
create trigger guard_locked_period_pay before insert or update on payments
  for each row execute function public.guard_locked_period();
drop trigger if exists guard_locked_period_rfd on refunds;
create trigger guard_locked_period_rfd before insert or update on refunds
  for each row execute function public.guard_locked_period();

-- ─────────────────────────────────────────────────────────────
-- 8. Period close / reopen (Ultra-only in app; audited).
-- ─────────────────────────────────────────────────────────────
create or replace function public.close_accounting_period(p_period uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v accounting_periods%rowtype;
begin
  select * into v from accounting_periods where id = p_period for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v.status = 'closed' then return jsonb_build_object('ok',false,'error','already_closed'); end if;
  update accounting_periods set status='closed', closed_by=p_actor, closed_at=now(),
    reopened_by=null, reopened_at=null, reopen_reason=null, updated_at=now() where id=p_period;
  return jsonb_build_object('ok',true,'label',v.label);
end $$;

create or replace function public.reopen_accounting_period(p_period uuid, p_actor uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v accounting_periods%rowtype;
begin
  if coalesce(btrim(p_reason),'') = '' then return jsonb_build_object('ok',false,'error','reason_required'); end if;
  select * into v from accounting_periods where id = p_period for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v.status <> 'closed' then return jsonb_build_object('ok',false,'error','not_closed'); end if;
  update accounting_periods set status='open', reopened_by=p_actor, reopened_at=now(),
    reopen_reason=p_reason, updated_at=now() where id=p_period;
  return jsonb_build_object('ok',true,'label',v.label);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 9. Controlled void of an issued invoice.
-- ─────────────────────────────────────────────────────────────
create or replace function public.void_sales_invoice(p_invoice uuid, p_reason text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v sales_invoices%rowtype; v_paid numeric; v_credit numeric; v_tax_point date;
begin
  if coalesce(btrim(p_reason),'') = '' then return jsonb_build_object('ok',false,'error','reason_required'); end if;
  select * into v from sales_invoices where id = p_invoice for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v.locked_at is null then return jsonb_build_object('ok',false,'error','not_issued'); end if;
  if v.status in ('void','cancelled') then return jsonb_build_object('ok',false,'error','already_void'); end if;

  select coalesce(sum(pa.amount),0) into v_paid
    from payment_allocations pa join payments p on p.id = pa.payment_id
    where pa.sales_invoice_id = p_invoice and p.status = 'confirmed';
  if v_paid > 0 then return jsonb_build_object('ok',false,'error','has_payments'); end if;

  select coalesce(sum(ca.amount),0) into v_credit
    from credit_note_allocations ca join credit_notes cn on cn.id = ca.credit_note_id
    where ca.sales_invoice_id = p_invoice and cn.status in ('issued','allocated');
  if v_credit > 0 then return jsonb_build_object('ok',false,'error','has_credits'); end if;

  v_tax_point := coalesce(v.tax_point_date, v.issue_date);
  if public.is_period_locked(v_tax_point) then return jsonb_build_object('ok',false,'error','period_locked'); end if;

  update sales_invoices set status='void', voided_at=now(), void_reason=p_reason,
    reconciliation_status = case when reconciliation_status='exported' then 'needs_re_export'
                                 when reconciliation_status='reconciled' then 'needs_re_export'
                                 else reconciliation_status end,
    updated_at=now()
  where id = p_invoice;
  perform public.recompute_invoice_financials(p_invoice);
  return jsonb_build_object('ok',true,'invoice_number',v.invoice_number);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 10. Refunds: record → approve (segregation) → complete.
-- ─────────────────────────────────────────────────────────────
create or replace function public.record_refund(
  p_payment uuid, p_credit_note uuid, p_amount numeric, p_date date,
  p_method text, p_reference text, p_reason text, p_actor uuid
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_num text; v_currency text; v_client uuid; v_invoice uuid;
  v_avail numeric; v_used numeric; v_pay payments%rowtype; v_cn credit_notes%rowtype;
begin
  if (p_payment is null) = (p_credit_note is null) then
    return jsonb_build_object('ok',false,'error','one_source_required');
  end if;
  if coalesce(p_amount,0) <= 0 then return jsonb_build_object('ok',false,'error','bad_amount'); end if;

  if p_payment is not null then
    select * into v_pay from payments where id = p_payment;
    if not found then return jsonb_build_object('ok',false,'error','payment_not_found'); end if;
    if v_pay.status <> 'confirmed' then return jsonb_build_object('ok',false,'error','payment_not_confirmed'); end if;
    select coalesce(sum(amount),0) into v_used from refunds where payment_id = p_payment and status <> 'cancelled';
    v_avail := v_pay.amount - v_used;
    v_currency := v_pay.currency; v_client := v_pay.client_id;
  else
    select * into v_cn from credit_notes where id = p_credit_note;
    if not found then return jsonb_build_object('ok',false,'error','credit_note_not_found'); end if;
    if v_cn.status not in ('issued','allocated') then return jsonb_build_object('ok',false,'error','credit_note_not_issued'); end if;
    select coalesce(sum(amount),0) into v_used from refunds where credit_note_id = p_credit_note and status <> 'cancelled';
    v_avail := v_cn.gross_total - coalesce(v_cn.allocated_total,0) - v_used;
    v_currency := v_cn.currency; v_client := v_cn.client_id; v_invoice := v_cn.sales_invoice_id;
  end if;

  if p_amount > v_avail + 0.005 then
    return jsonb_build_object('ok',false,'error','exceeds_available','available',round(v_avail,2));
  end if;

  v_num := public.next_refund_number();
  insert into refunds(refund_number, payment_id, credit_note_id, sales_invoice_id, client_id,
    currency, amount, refund_date, method, external_reference, reason, status, recorded_by)
  values (v_num, p_payment, p_credit_note, v_invoice, v_client, coalesce(v_currency,'GBP'),
    round(p_amount,2), coalesce(p_date, current_date), coalesce(p_method,'bank_transfer'),
    p_reference, p_reason, 'pending', p_actor);
  return jsonb_build_object('ok',true,'refund_number',v_num);
end $$;

create or replace function public.approve_refund(p_refund uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v refunds%rowtype;
begin
  select * into v from refunds where id = p_refund for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v.status <> 'pending' then return jsonb_build_object('ok',false,'error','not_pending'); end if;
  if v.recorded_by is not null and v.recorded_by = p_actor then
    return jsonb_build_object('ok',false,'error','segregation'); -- cannot approve own refund
  end if;
  update refunds set status='approved', approved_by=p_actor, approved_at=now(), updated_at=now() where id=p_refund;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.complete_refund(p_refund uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v refunds%rowtype; v_total numeric; v_pay payments%rowtype; r record;
begin
  select * into v from refunds where id = p_refund for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v.status <> 'approved' then return jsonb_build_object('ok',false,'error','not_approved'); end if;

  update refunds set status='completed', completed_at=now(), updated_at=now() where id=p_refund;

  -- If a payment is now fully refunded, flip its status and recompute the
  -- invoices it had paid (refunded payments no longer count as paid).
  if v.payment_id is not null then
    select * into v_pay from payments where id = v.payment_id for update;
    select coalesce(sum(amount),0) into v_total from refunds where payment_id = v.payment_id and status = 'completed';
    if v_total >= v_pay.amount - 0.005 and v_pay.status = 'confirmed' then
      update payments set status='refunded', updated_at=now() where id = v.payment_id;
      for r in select distinct sales_invoice_id from payment_allocations where payment_id = v.payment_id loop
        perform public.recompute_invoice_financials(r.sales_invoice_id);
      end loop;
    end if;
  end if;
  return jsonb_build_object('ok',true);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 11. Stamp an export run onto the documents it covered.
--     p_refs = { sales_invoices:[], credit_notes:[], payments:[], refunds:[] }
-- ─────────────────────────────────────────────────────────────
create or replace function public.stamp_export_run(p_run uuid, p_refs jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n int; total int := 0;
begin
  update sales_invoices set reconciliation_status='exported', export_run_id=p_run, updated_at=now()
    where id in (select (jsonb_array_elements_text(coalesce(p_refs->'sales_invoices','[]'::jsonb)))::uuid)
      and reconciliation_status in ('not_exported','needs_re_export');
  get diagnostics n = row_count; total := total + n;
  update credit_notes set reconciliation_status='exported', export_run_id=p_run, updated_at=now()
    where id in (select (jsonb_array_elements_text(coalesce(p_refs->'credit_notes','[]'::jsonb)))::uuid)
      and reconciliation_status in ('not_exported','needs_re_export');
  get diagnostics n = row_count; total := total + n;
  update payments set reconciliation_status='exported', export_run_id=p_run, updated_at=now()
    where id in (select (jsonb_array_elements_text(coalesce(p_refs->'payments','[]'::jsonb)))::uuid)
      and reconciliation_status in ('not_exported','needs_re_export');
  get diagnostics n = row_count; total := total + n;
  update refunds set reconciliation_status='exported', export_run_id=p_run, updated_at=now()
    where id in (select (jsonb_array_elements_text(coalesce(p_refs->'refunds','[]'::jsonb)))::uuid)
      and reconciliation_status in ('not_exported','needs_re_export');
  get diagnostics n = row_count; total := total + n;
  return jsonb_build_object('ok',true,'stamped',total);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 12. Private Storage bucket for accounting export CSVs.
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('accounting-exports', 'accounting-exports', false, 52428800, array['text/csv'])
  on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 13. SECURITY DEFINER lockdown — service_role only.
-- ─────────────────────────────────────────────────────────────
do $$
declare fn text; sigs text[] := array[
  'public.is_period_locked(date)',
  'public.next_refund_number()',
  'public.next_export_number()',
  'public.guard_locked_period()',
  'public.close_accounting_period(uuid,uuid)',
  'public.reopen_accounting_period(uuid,uuid,text)',
  'public.void_sales_invoice(uuid,text,uuid)',
  'public.record_refund(uuid,uuid,numeric,date,text,text,text,uuid)',
  'public.approve_refund(uuid,uuid)',
  'public.complete_refund(uuid,uuid)',
  'public.stamp_export_run(uuid,jsonb)'
];
begin
  foreach fn in array sigs loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
