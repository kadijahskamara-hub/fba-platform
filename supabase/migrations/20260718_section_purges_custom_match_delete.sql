-- ============================================================
-- Sprint 19 — Sectioned data resets + Custom Match deletion.
-- APPLIED to qnuqvdzguesetnevhsoc on 2026-07-18 via Supabase MCP.
--
-- 1. purge_platform_section(actor, section, reason) — Ultra-only
--    delete-ALL for ONE business section (quotes, orders, finance,
--    deliveries, procurement, custom match, quote requests, retail
--    orders, comms, accounting, service enquiries, projects/carts,
--    trade apps/contacts, customer accounts). Sections that other
--    data still depends on refuse with a BLOCKED message naming
--    the section to purge first.
-- 2. purge_commercial_data — extended to cover tables added after
--    Sprint 7.1: Custom Match, client projects, carts, service
--    enquiries; restarts custom_match_number_seq too.
-- 3. delete_commercial_record — new entities: custom_match,
--    trade_application, service_enquiry.
--
-- All powers remain Ultra Admin only, service_role-locked,
-- reason-required and audited (Sprint 7.1 pattern).
-- ============================================================

-- ── 1. Purge ONE business section ────────────────────────────

create or replace function purge_platform_section(
  p_actor   uuid,
  p_section text,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    users%rowtype;
  v_counts   jsonb  := '{}'::jsonb;
  v_total    bigint := 0;
  v_n        bigint;
  v_user_ids uuid[];
begin
  v_actor := _ops_require_ultra(p_actor, p_reason);

  if p_section not in (
    'communications','accounting','finance','deliveries','procurement',
    'commercial_orders','quotes','custom_match','quote_requests',
    'retail_orders','service_enquiries','projects_carts',
    'trade_contacts','customer_accounts'
  ) then
    raise exception 'INVALID_SECTION: % is not a purgeable section', p_section;
  end if;

  perform _ops_set_immutability(false);

  case p_section

  when 'communications' then
    delete from communication_events;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('communication_events', v_n); end if;
    delete from communication_packs;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('communication_packs', v_n); end if;
    delete from document_files;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('document_files', v_n); end if;
    alter sequence communication_number_seq restart with 1;

  when 'accounting' then
    delete from export_runs;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('export_runs', v_n); end if;
    delete from accounting_periods;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('accounting_periods', v_n); end if;
    alter sequence export_run_seq restart with 1;

  when 'finance' then
    delete from document_files where entity_id in (
      select id from sales_invoices
      union all select id from credit_notes
      union all select id from payment_receipts
    );
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('document_files', v_n); end if;
    delete from refunds;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('refunds', v_n); end if;
    delete from payment_receipts;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('payment_receipts', v_n); end if;
    delete from payment_allocations;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('payment_allocations', v_n); end if;
    delete from credit_note_allocations;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('credit_note_allocations', v_n); end if;
    delete from credit_notes;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('credit_notes', v_n); end if;
    delete from payments;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('payments', v_n); end if;
    delete from sales_invoices;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('sales_invoices', v_n); end if;
    alter sequence invoice_number_seq restart with 1;
    alter sequence credit_note_number_seq restart with 1;
    alter sequence receipt_number_seq restart with 1;
    alter sequence refund_number_seq restart with 1;

  when 'deliveries' then
    delete from document_files where entity_id in (select id from deliveries union all select id from installations);
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('document_files', v_n); end if;
    delete from proof_of_delivery;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('proof_of_delivery', v_n); end if;
    delete from deliveries;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('deliveries', v_n); end if;
    delete from installations;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('installations', v_n); end if;
    delete from delivery_locations;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('delivery_locations', v_n); end if;
    alter sequence delivery_number_seq restart with 1;
    alter sequence installation_number_seq restart with 1;

  when 'procurement' then
    update supplier_allocations set allocation_status = 'ready_for_po', updated_at = now()
    where allocation_status = 'included_in_po';
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('supplier_allocations_released', v_n); end if;
    delete from document_files where entity_id in (select id from purchase_orders);
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('document_files', v_n); end if;
    delete from purchase_orders;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('purchase_orders', v_n); end if;
    alter sequence purchase_order_number_seq restart with 1;

  when 'commercial_orders' then
    -- Full downstream chain for every order, mirroring
    -- delete_commercial_record('commercial_order') set-based.
    delete from document_files where entity_id in (
      select id from deliveries union all select id from installations
      union all select id from purchase_orders
      union all select id from sales_invoices where commercial_order_id is not null
      union all select id from commercial_orders
    );
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('document_files', v_n); end if;
    delete from proof_of_delivery;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('proof_of_delivery', v_n); end if;
    delete from deliveries;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('deliveries', v_n); end if;
    delete from installations;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('installations', v_n); end if;
    delete from delivery_locations;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('delivery_locations', v_n); end if;
    delete from purchase_orders;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('purchase_orders', v_n); end if;
    delete from refunds where sales_invoice_id in (select id from sales_invoices where commercial_order_id is not null)
       or payment_id in (select id from payments where commercial_order_id is not null)
       or credit_note_id in (select id from credit_notes where sales_invoice_id in
            (select id from sales_invoices where commercial_order_id is not null));
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('refunds', v_n); end if;
    delete from credit_notes where sales_invoice_id in (select id from sales_invoices where commercial_order_id is not null);
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('credit_notes', v_n); end if;
    delete from payment_allocations where sales_invoice_id in (select id from sales_invoices where commercial_order_id is not null)
       or payment_id in (select id from payments where commercial_order_id is not null);
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('payment_allocations', v_n); end if;
    delete from payments where commercial_order_id is not null;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('payments', v_n); end if;
    delete from sales_invoices where commercial_order_id is not null;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('sales_invoices', v_n); end if;
    delete from communication_packs where commercial_order_id is not null;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('communication_packs', v_n); end if;
    delete from commercial_orders;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('commercial_orders', v_n); end if;
    alter sequence sales_order_number_seq restart with 1;

  when 'quotes' then
    if exists (select 1 from commercial_orders) then
      raise exception 'BLOCKED: commercial orders still exist — purge the Commercial orders section first';
    end if;
    delete from commercial_acceptances;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('commercial_acceptances', v_n); end if;
    delete from document_files where entity_id in (select id from issued_documents);
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('document_files', v_n); end if;
    delete from communication_packs where proforma_id is not null;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('communication_packs', v_n); end if;
    delete from proformas;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('proformas', v_n); end if;
    alter sequence proforma_number_seq restart with 1;
    alter sequence quote_number_seq restart with 1;

  when 'custom_match' then
    delete from custom_match_requests;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('custom_match_requests', v_n); end if;
    alter sequence custom_match_number_seq restart with 1;

  when 'quote_requests' then
    delete from quote_requests;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('quote_requests', v_n); end if;

  when 'retail_orders' then
    delete from retail_orders;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('retail_orders', v_n); end if;

  when 'service_enquiries' then
    delete from service_enquiries;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('service_enquiries', v_n); end if;

  when 'projects_carts' then
    if exists (select 1 from quote_requests where project_id is not null) then
      raise exception 'BLOCKED: quote requests still reference client projects — purge the Quote requests section first';
    end if;
    delete from projects;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('projects', v_n); end if;
    delete from cart_items;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('cart_items', v_n); end if;

  when 'trade_contacts' then
    delete from trade_applications;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('trade_applications', v_n); end if;
    delete from contacts;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('contacts', v_n); end if;

  when 'customer_accounts' then
    v_user_ids := array(
      select id from users
      where role not in ('admin', 'staff') and coalesce(is_ultra_admin, false) = false
    );
    if exists (select 1 from quote_requests where user_id = any(v_user_ids)) then
      raise exception 'BLOCKED: quote requests belong to these accounts — purge the Quote requests section first';
    end if;
    if exists (select 1 from retail_orders where user_id = any(v_user_ids)) then
      raise exception 'BLOCKED: retail orders belong to these accounts — purge the Retail orders section first';
    end if;
    delete from product_analytics_events where user_id = any(v_user_ids);
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('product_analytics_events', v_n); end if;
    delete from users where id = any(v_user_ids);
    get diagnostics v_n = row_count; v_total := v_total + v_n;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('users', v_n); end if;

  end case;

  perform _ops_set_immutability(true);

  insert into audit_logs (actor_id, actor_email, action, entity_type, entity_id, before_value, after_value)
  values (
    p_actor, v_actor.email, 'commercial_data.section_purged', 'platform', p_section,
    v_counts,
    jsonb_build_object('reason', trim(p_reason), 'section', p_section, 'rows_deleted', v_total)
  );

  return jsonb_build_object('purged', true, 'section', p_section, 'rows_deleted', v_total, 'by_table', v_counts);
end;
$$;

-- ── 2. Extend the full transactional purge ───────────────────

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
    'supplier_allocations',
    'custom_match_attachments', 'custom_match_requests',
    'commercial_orders',
    'proforma_line_items', 'proformas',
    'quote_request_items', 'quote_requests',
    'retail_order_items', 'retail_orders',
    'project_item_finish_selections', 'project_items', 'projects',
    'cart_items', 'service_enquiries',
    'export_runs', 'accounting_periods'
  ];
  v_sequences text[] := array[
    'communication_number_seq', 'credit_note_number_seq',
    'custom_match_number_seq',
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

-- ── 3. Single-record deletion: new entities ──────────────────

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
                      'retail_order','quote_request','custom_match',
                      'trade_application','service_enquiry') then
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

  when 'custom_match' then
    select to_jsonb(t) into v_snapshot from custom_match_requests t where id = p_id;
    if v_snapshot is null then raise exception 'NOT_FOUND: custom match request does not exist'; end if;
    v_label := coalesce(v_snapshot->>'reference', 'custom match request');
    delete from custom_match_requests where id = p_id;  -- cascades attachments

  when 'trade_application' then
    select to_jsonb(t) into v_snapshot from trade_applications t where id = p_id;
    if v_snapshot is null then raise exception 'NOT_FOUND: trade application does not exist'; end if;
    v_label := coalesce(v_snapshot->>'company_name', v_snapshot->>'email', 'trade application');
    delete from trade_applications where id = p_id;  -- communication packs keep SET NULL

  when 'service_enquiry' then
    select to_jsonb(t) into v_snapshot from service_enquiries t where id = p_id;
    if v_snapshot is null then raise exception 'NOT_FOUND: service enquiry does not exist'; end if;
    v_label := coalesce(v_snapshot->>'email', 'service enquiry');
    delete from service_enquiries where id = p_id;

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
revoke all on function purge_platform_section(uuid, text, text) from public, anon, authenticated;
revoke all on function purge_commercial_data(uuid, text) from public, anon, authenticated;
revoke all on function delete_commercial_record(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function purge_platform_section(uuid, text, text) to service_role;
grant execute on function purge_commercial_data(uuid, text) to service_role;
grant execute on function delete_commercial_record(uuid, text, uuid, text) to service_role;
