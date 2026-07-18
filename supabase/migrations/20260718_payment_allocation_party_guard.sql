-- ============================================================
-- Sprint 16 — payment allocation party guard.
--
-- allocate_payment already validated confirmed status, issued
-- status, currency, and both balances, but nothing stopped a
-- payment being allocated to a DIFFERENT client's invoice. Add a
-- party check: when both sides carry a client_id they must match;
-- otherwise fall back to the commercial order. Records that carry
-- neither on one side are allowed through (legacy/unattached data)
-- so this cannot retroactively block existing valid allocations.
-- ============================================================

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
  if v_inv.voided_at is not null then return jsonb_build_object('ok',false,'error','invoice_voided'); end if;
  if v_pay.currency <> v_inv.currency then return jsonb_build_object('ok',false,'error','currency_mismatch'); end if;

  -- Party guard (Sprint 16).
  if v_pay.client_id is not null and v_inv.client_id is not null
     and v_pay.client_id <> v_inv.client_id then
    return jsonb_build_object('ok',false,'error','party_mismatch');
  end if;
  if (v_pay.client_id is null or v_inv.client_id is null)
     and v_pay.commercial_order_id is not null and v_inv.commercial_order_id is not null
     and v_pay.commercial_order_id <> v_inv.commercial_order_id then
    return jsonb_build_object('ok',false,'error','party_mismatch');
  end if;

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

-- Re-assert the Sprint 4 lock-down: definer functions are not callable by anon/authenticated.
revoke all on function public.allocate_payment(uuid,uuid,numeric,uuid) from public, anon, authenticated;
