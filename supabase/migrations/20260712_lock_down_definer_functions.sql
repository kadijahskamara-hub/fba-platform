-- ============================================================
-- Sprint 3 hardening: lock down SECURITY DEFINER functions.
--
-- These functions run as owner (bypassing RLS) and are invoked by
-- the app only through the service-role client. Supabase exposes
-- RPC to the anon/authenticated roles by default, so we REVOKE
-- EXECUTE from PUBLIC/anon/authenticated and grant it to
-- service_role only — closing the PostgREST bypass the security
-- advisor flagged. Also pins guard_issued_invoice's search_path.
-- ============================================================

-- Pin trigger function search_path (advisor: function_search_path_mutable)
create or replace function public.guard_issued_invoice()
returns trigger language plpgsql security definer set search_path to 'public' as $$
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

do $$
declare
  fn text;
  sigs text[] := array[
    'public.next_quote_number()',
    'public.next_invoice_number()',
    'public.next_purchase_order_number()',
    'public.next_sales_order_number()',
    'public.next_credit_note_number()',
    'public.next_receipt_number()',
    'public.recompute_invoice_financials(uuid)',
    'public.accept_commercial_document(text,text,text,text,text,text,text)',
    'public.allocate_payment(uuid,uuid,numeric,uuid)',
    'public.reverse_payment(uuid,uuid,text)',
    'public.issue_sales_invoice(uuid,jsonb,uuid)',
    'public.issue_credit_note(uuid,jsonb,uuid)',
    'public.allocate_credit_note(uuid,uuid,numeric,uuid)',
    'public.acknowledge_purchase_order(text,text,text,text,text,date)'
  ];
begin
  foreach fn in array sigs loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- Trigger functions must not be RPC-callable (they run in trigger context).
revoke all on function public.guard_issued_invoice() from public, anon, authenticated;
revoke all on function public.reject_mutation() from public, anon, authenticated;
