-- ============================================================
-- Sprint 7.1 — Ultra-only commercial data deletion.
-- APPLIED to qnuqvdzguesetnevhsoc on 2026-07-15 via Supabase MCP.
--
-- Two powers, both Ultra Admin only (never grantable):
--   1. purge_commercial_data(actor, reason) — deletes ALL
--      quotes/proformas, orders, POs, invoices, payments,
--      credit notes, refunds, deliveries, installations,
--      documents, communications, exports and accounting
--      periods, then restarts every document-number sequence
--      at 1. Built for the pre-launch test-data reset.
--   2. delete_commercial_record(actor, entity, id, reason) —
--      deletes ONE record of a given type together with its
--      dependent children, preserving unrelated data.
--
-- The Sprint 1–6 immutability triggers exist to protect live
-- financial history from ordinary mutation paths. These fns
-- temporarily disable exactly those triggers INSIDE the atomic
-- transaction (table-owner DDL), then re-enable them — the
-- protection remains intact for every other code path.
-- Every use is audited with actor + reason (+ counts/snapshot).
-- ============================================================

-- ── Immutability trigger toggle helpers (internal) ────────────

create or replace function _ops_set_immutability(p_enabled boolean)
returns void
language plpgsql
set search_path = public
as $$
declare
  t record;
begin
  for t in
    select event_object_table as tbl, trigger_name as trg
    from information_schema.triggers
    where event_object_schema = 'public'
      and trigger_name in (
        'communication_events_immutable',
        'credit_note_snapshots_immutable',
        'delivery_note_snapshots_immutable',
        'document_files_immutable',
        'export_runs_immutable',
        'issued_documents_immutable',
        'payment_receipts_immutable',
        'purchase_order_snapshots_immutable',
        'sales_invoice_snapshots_immutable'
      )
    group by 1, 2
  loop
    execute format('alter table %I %s trigger %I',
      t.tbl, case when p_enabled then 'enable' else 'disable' end, t.trg);
  end loop;
end;
$$;

-- ── Ultra check helper (internal) ─────────────────────────────

create or replace function _ops_require_ultra(p_actor uuid, p_reason text)
returns users
language plpgsql
set search_path = public
as $$
declare
  v_actor users%rowtype;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: a reason must be provided';
  end if;
  select * into v_actor from users where id = p_actor;
  if not found or v_actor.status <> 'active' or not v_actor.is_ultra_admin then
    raise exception 'FORBIDDEN: this is an Ultra Admin power';
  end if;
  return v_actor;
end;
$$;

-- ── 1. Purge ALL commercial data ─────────────────────────────

create or replace function purge_commercial_data(
  p_actor  uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  users%rowtype;
  v_tables text[] := array[
    -- children first; order respects every RESTRICT rule
    'delivery_line_exceptions', 'pod_photos', 'proof_of_delivery',
    'delivery_confirmation_tokens', 'delivery_note_snapshots',
    'delivery_packages', 'delivery_lines',
    'communication_events', 'communication_packs', 'document_files',
    'refunds', 'payment_receipts', 'payment_allocations',
    'credit_note_allocations', 'credit_note_lines', 'credit_note_snapshots',
    'credit_notes', 'payments',
    'sales_invoice_snapshots', 'sales_invoice_lines', 'sales_invoices',
    'commercial_acceptance_tokens', 'commercial_acceptances',
    'proforma_downloads', 'issued_documents',
    'purchase_order_ack_tokens', 'purchase_order_snapshots',
    'purchase_order_lines', 'purchase_orders',
    'deliveries', 'installations', 'site_contacts', 'delivery_locations',
    'supplier_allocations', 'commercial_orders',
    'proforma_line_items', 'proformas',
    'quote_request_items', 'quote_requests',
    'retail_order_items', 'retail_orders',
    'export_runs', 'accounting_periods'
  ];
  v_sequences text[] := array[
    'communication_number_seq', 'credit_note_number_seq',
    'delivery_number_seq', 'export_run_seq', 'installation_number_seq',
    'invoice_number_seq', 'proforma_number_seq',
    'purchase_order_number_seq', 'quote_number_seq',
    'receipt_number_seq', 'refund_number_seq', 'sales_order_number_seq'
  ];
  v_tbl    text;
  v_seq    text;
  v_n      bigint;
  v_total  bigint := 0;
  v_counts jsonb := '{}'::jsonb;
begin
  v_actor := _ops_require_ultra(p_actor, p_reason);

  perform _ops_set_immutability(false);

  foreach v_tbl in array v_tables loop
    execute format('delete from %I', v_tbl);
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_counts := v_counts || jsonb_build_object(v_tbl, v_n);
    end if;
    v_total := v_total + v_n;
  end loop;

  perform _ops_set_immutability(true);

  -- Fresh numbering for go-live: next document of each type is 0001.
  foreach v_seq in array v_sequences loop
    execute format('alter sequence %I restart with 1', v_seq);
  end loop;

  insert into audit_logs (actor_id, actor_email, action, entity_type, entity_id, before_value, after_value)
  values (
    p_actor, v_actor.email, 'commercial_data.purged', 'platform', null,
    v_counts,
    jsonb_build_object('reason', trim(p_reason), 'rows_deleted', v_total, 'sequences_restarted', v_sequences)
  );

  return jsonb_build_object('purged', true, 'rows_deleted', v_total, 'by_table', v_counts);
end;
$$;

-- ── 2. Delete ONE commercial record (+ dependents) ────────────

create or replace function delete_commercial_record(
  p_actor  uuid,
  p_entity text,
  p_id     uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    users%rowtype;
  v_snapshot jsonb;
  v_label    text;
  v_invoices uuid[];
  v_payments uuid[];
  v_inv      uuid;
begin
  v_actor := _ops_require_ultra(p_actor, p_reason);

  if p_entity not in ('proforma','commercial_order','sales_invoice','payment',
                      'credit_note','refund','delivery','purchase_order',
                      'retail_order','quote_request') then
    raise exception 'INVALID_ENTITY: % is not deletable through this function', p_entity;
  end if;

  perform _ops_set_immutability(false);

  case p_entity

  when 'proforma' then
    select to_jsonb(t) - 'items' into v_snapshot from proformas t where id = p_id;
    if v_snapshot is null then raise exception 'NOT_FOUND: proforma does not exist'; end if;
    v_label := v_snapshot->>'proforma_number';
    if exists (select 1 from commercial_orders where source_proforma_id = p_id) then
      raise exception 'HAS_ORDER: this quote was converted to a commercial order — delete the order first';
    end if;
    delete from commercial_acceptances where proforma_id = p_id;
    delete from communication_packs where proforma_id = p_id;
    delete from document_files where entity_id in (select id from issued_documents where proforma_id = p_id);
    delete from proformas where id = p_id;  -- cascades: issued docs, downloads, lines, tokens

  when 'commercial_order' then
    select to_jsonb(t) - 'commercial_snapshot' into v_snapshot from commercial_orders t where id = p_id;
    if v_snapshot is null then raise exception 'NOT_FOUND: order does not exist'; end if;
    v_label := v_snapshot->>'order_number';
    select coalesce(array_agg(id), '{}') into v_invoices from sales_invoices where commercial_order_id = p_id;
    select coalesce(array_agg(id), '{}') into v_payments from payments where commercial_order_id = p_id;
    -- delivery chain
    delete from proof_of_delivery where delivery_id in (select id from deliveries where commercial_order_id = p_id);
    delete from deliveries where commercial_order_id = p_id;   -- cascades lines/exceptions/tokens/packages/snapshots
    delete from installations where commercial_order_id = p_id;
    delete from delivery_locations where commercial_order_id = p_id;  -- cascades site_contacts
    -- procurement chain
    delete from document_files where entity_id in (select id from purchase_orders where commercial_order_id = p_id);
    delete from purchase_orders where commercial_order_id = p_id;  -- cascades lines/snapshots/tokens
    -- money chain
    delete from refunds where sales_invoice_id = any(v_invoices)
       or payment_id = any(v_payments)
       or credit_note_id in (select id from credit_notes where sales_invoice_id = any(v_invoices));
    delete from credit_notes where sales_invoice_id = any(v_invoices); -- cascades lines/snapshots/allocations
    delete from payment_allocations where sales_invoice_id = any(v_invoices) or payment_id = any(v_payments);
    delete from payment_receipts where payment_id = any(v_payments);
    delete from payments where commercial_order_id = p_id;
    delete from document_files where entity_id = any(v_invoices);
    delete from sales_invoices where commercial_order_id = p_id;   -- cascades lines/snapshots
    -- comms + docs addressed to the order itself
    delete from communication_packs where commercial_order_id = p_id;
    delete from document_files where entity_id = p_id;
    delete from commercial_orders where id = p_id;  -- cascades supplier_allocations

  when 'sales_invoice' then
    select to_jsonb(t) into v_snapshot from sales_invoices t where id = p_id;
    if v_snapshot is null then raise exception 'NOT_FOUND: invoice does not exist'; end if;
    v_label := v_snapshot->>'invoice_number';
    delete from refunds where sales_invoice_id = p_id
       or credit_note_id in (select id from credit_notes where sales_invoice_id = p_id);
    delete from credit_notes where sales_invoice_id = p_id;
    delete from credit_note_allocations where sales_invoice_id = p_id;
    delete from payment_allocations where sales_invoice_id = p_id;
    delete from communication_packs where sales_invoice_id = p_id;
    delete from document_files where entity_id = p_id;
    delete from sales_invoices where id = p_id;

  when 'payment' then
    select to_jsonb(t) into v_snapshot from payments t where id = p_id;
    if v_snapshot is null then raise exception 'NOT_FOUND: payment does not exist'; end if;
    v_label := v_snapshot->>'payment_reference';
    select coalesce(array_agg(distinct sales_invoice_id), '{}') into v_invoices
      from payment_allocations where payment_id = p_id;
    delete from refunds where payment_id = p_id;
    delete from document_files where entity_id in (select id from payment_receipts where payment_id = p_id);
    delete from payments where id = p_id;  -- cascades receipts + allocations
    -- keep surviving invoices' paid/balance figures truthful
    foreach v_inv in array v_invoices loop
      perform recompute_invoice_financials(v_inv);
    end loop;

  when 'credit_note' then
    select to_jsonb(t) into v_snapshot from credit_notes t where id = p_id;
    if v_snapshot is null then raise exception 'NOT_FOUND: credit note does not exist'; end if;
    v_label := v_snapshot->>'credit_note_number';
    select coalesce(array_agg(distinct sales_invoice_id), '{}') into v_invoices
      from credit_note_allocations where credit_note_id = p_id;
    if v_snapshot->>'sales_invoice_id' is not null then
      v_invoices := v_invoices || (v_snapshot->>'sales_invoice_id')::uuid;
    end if;
    delete from refunds where credit_note_id = p_id;
    delete from document_files where entity_id = p_id;
    delete from credit_notes where id = p_id;  -- cascades lines/snapshots/allocations
    foreach v_inv in array v_invoices loop
      if exists (select 1 from sales_invoices where id = v_inv) then
        perform recompute_invoice_financials(v_inv);
      end if;
    end loop;

  when 'refund' then
    select to_jsonb(t) into v_snapshot from refunds t where id = p_id;
    if v_snapshot is null then raise exception 'NOT_FOUND: refund does not exist'; end if;
    v_label := v_snapshot->>'refund_number';
    delete from refunds where id = p_id;

  when 'delivery' then
    select to_jsonb(t) into v_snapshot from deliveries t where id = p_id;
    if v_snapshot is null then raise exception 'NOT_FOUND: delivery does not exist'; end if;
    v_label := v_snapshot->>'delivery_number';
    delete from proof_of_delivery where delivery_id = p_id;  -- cascades pod_photos
    delete from communication_packs where delivery_id = p_id;
    delete from document_files where entity_id = p_id;
    delete from deliveries where id = p_id;  -- cascades lines/exceptions/tokens/packages/snapshots

  when 'purchase_order' then
    select to_jsonb(t) - 'margin_analysis' into v_snapshot from purchase_orders t where id = p_id;
    if v_snapshot is null then raise exception 'NOT_FOUND: purchase order does not exist'; end if;
    v_label := v_snapshot->>'purchase_order_number';
    -- release allocations back to ready_for_po before the lines vanish
    update supplier_allocations set allocation_status = 'ready_for_po', updated_at = now()
    where allocation_status = 'included_in_po'
      and id in (select supplier_allocation_id from purchase_order_lines
                 where purchase_order_id = p_id and supplier_allocation_id is not null);
    delete from communication_packs where purchase_order_id = p_id;
    delete from document_files where entity_id = p_id;
    delete from purchase_orders where id = p_id;  -- cascades lines/snapshots/tokens

  when 'retail_order' then
    select to_jsonb(t) into v_snapshot from retail_orders t where id = p_id;
    if v_snapshot is null then raise exception 'NOT_FOUND: retail order does not exist'; end if;
    v_label := v_snapshot->>'order_number';
    delete from retail_orders where id = p_id;  -- cascades items

  when 'quote_request' then
    select to_jsonb(t) into v_snapshot from quote_requests t where id = p_id;
    if v_snapshot is null then raise exception 'NOT_FOUND: quote request does not exist'; end if;
    v_label := coalesce(v_snapshot->>'project_name', 'quote request');
    delete from quote_requests where id = p_id;  -- cascades items; proformas keep SET NULL

  end case;

  perform _ops_set_immutability(true);

  insert into audit_logs (actor_id, actor_email, action, entity_type, entity_id, before_value, after_value)
  values (
    p_actor, v_actor.email, 'commercial_record.deleted', p_entity, p_id::text,
    v_snapshot,
    jsonb_build_object('reason', trim(p_reason), 'label', v_label)
  );

  return jsonb_build_object('deleted', true, 'entity', p_entity, 'id', p_id, 'label', v_label);
end;
$$;

-- ── Lock down: service_role only (same-migration rule) ────────
revoke all on function _ops_set_immutability(boolean) from public, anon, authenticated;
revoke all on function _ops_require_ultra(uuid, text) from public, anon, authenticated;
revoke all on function purge_commercial_data(uuid, text) from public, anon, authenticated;
revoke all on function delete_commercial_record(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function purge_commercial_data(uuid, text) to service_role;
grant execute on function delete_commercial_record(uuid, text, uuid, text) to service_role;
