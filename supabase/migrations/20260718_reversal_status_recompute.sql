-- ============================================================
-- Sprint 18 (QA P1): payment reversal left sales_invoices.status
-- stuck at 'paid'.
--
-- recompute_invoice_financials derived 'paid' / 'partially_paid' /
-- 'overdue' but had no branch for an issued invoice whose
-- allocations dropped back to zero (reversal or full un-allocation):
-- the CASE fell through to `else status`, preserving 'paid' while
-- amount_paid/balance_due were correctly restored. The invoice list
-- and detail then misreported an unpaid invoice as paid.
--
-- Fix: mirror the pure TS helper deriveInvoiceStatus() exactly —
-- add `when v_locked is not null then 'issued'` before the ELSE.
-- Everything else is unchanged.
-- ============================================================

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
      -- Sprint 18: an issued invoice with no confirmed money against it
      -- reverts to 'issued' (was: fell through to `else status`, so a
      -- reversed payment left the invoice claiming to be 'paid').
      when v_locked is not null then 'issued'
      else status
    end,
    updated_at = now()
  where id = p_invoice_id;
end;
$$;

-- The lockdown migration already revoked public execute on this fn
-- (definer functions are service-role only); re-assert to be safe.
revoke all on function public.recompute_invoice_financials(uuid) from public, anon, authenticated;
