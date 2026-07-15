-- ============================================================
-- Sprint 7 Part A — Procurement operations dashboard.
-- APPLIED to qnuqvdzguesetnevhsoc on 2026-07-15 via Supabase MCP.
--
-- Read-heavy sprint, minimal schema:
--   1. operations settings on commercial_settings
--      (backorder_flag_days, exposure_alert_percent,
--       stale_order_days) — defaults mirrored in
--       lib/commercial/operationsLogic.ts.
--   2. Covering indexes for the dashboard queries.
--   3. SECURITY INVOKER views for the heavy aggregates
--      (vw_order_operations, vw_supplier_progress,
--       vw_order_exposure). RLS-safe: only the service role
--      reads them (RLS is enabled with no policies on every
--      underlying table, so invoker semantics deny everyone
--      else); no SECURITY DEFINER anywhere.
-- ============================================================

-- 1 ── operations settings ------------------------------------
alter table commercial_settings
  add column if not exists backorder_flag_days integer not null default 14,
  add column if not exists exposure_alert_percent numeric not null default 50,
  add column if not exists stale_order_days integer not null default 30;

-- 2 ── covering indexes ---------------------------------------
create index if not exists idx_pos_status_ack_due
  on purchase_orders (status, acknowledgement_due_date);
create index if not exists idx_pos_order_status
  on purchase_orders (commercial_order_id, status);
create index if not exists idx_pos_maker_status
  on purchase_orders (manufacturer_id, status);
create index if not exists idx_deliveries_order
  on deliveries (commercial_order_id);
create index if not exists idx_deliveries_expected
  on deliveries (expected_date)
  where dispatch_status not in ('delivered', 'returned');
create index if not exists idx_payments_order_status
  on payments (commercial_order_id, status);
create index if not exists idx_invoices_order_status
  on sales_invoices (commercial_order_id, status);
create index if not exists idx_allocations_order_status
  on supplier_allocations (commercial_order_id, allocation_status);
create index if not exists idx_installations_order
  on installations (commercial_order_id);
create index if not exists idx_dle_resolution
  on delivery_line_exceptions (resolution_status)
  where resolution_status in ('open', 'reordering');

-- 3 ── views (SECURITY INVOKER, service-role reads only) ------

-- One row per commercial order with the aggregate counts/sums the
-- dashboard needs; fine-grained rules run in operationsLogic.ts.
-- Every aggregate is a LATERAL subquery so one-to-many joins can
-- never multiply sums.
create or replace view vw_order_operations
with (security_invoker = on) as
select
  o.id,
  o.order_number,
  o.status,
  o.currency,
  o.client_id,
  o.client_snapshot->>'company_name'                       as client_company,
  coalesce(o.client_snapshot->>'contact_name',
           o.client_snapshot->>'name')                     as client_name,
  o.accepted_at,
  o.updated_at,
  -- POs
  coalesce(pos.po_count, 0)                     as po_count,
  coalesce(pos.po_awaiting_ack, 0)              as po_awaiting_ack,
  coalesce(pos.po_awaiting_approval, 0)         as po_awaiting_approval,
  coalesce(pos.po_margin_at_risk_unresolved, 0) as po_margin_at_risk_unresolved,
  coalesce(pos.supplier_committed_total, 0)     as supplier_committed_total,
  -- Allocations
  coalesce(alc.allocation_count, 0)             as allocation_count,
  coalesce(alc.allocations_missing_cost, 0)     as allocations_missing_cost,
  coalesce(alc.supplier_uncommitted_total, 0)   as supplier_uncommitted_total,
  -- Deliveries & installations
  coalesce(del.delivery_count, 0)               as delivery_count,
  coalesce(del.deliveries_open, 0)              as deliveries_open,
  coalesce(ins.installations_required, 0)       as installations_required,
  coalesce(ins.installations_completed, 0)      as installations_completed,
  -- Money
  coalesce(inv.total, 0)                        as client_invoiced_total,
  coalesce(pay.total, 0)                        as client_paid_confirmed_total
from commercial_orders o
left join lateral (
  select
    count(*) filter (where po.status <> 'cancelled')                                as po_count,
    count(*) filter (where po.status in ('issued','viewed')
                       and po.acknowledged_at is null)                              as po_awaiting_ack,
    count(*) filter (where po.status = 'pending_approval'
                       or (po.status = 'draft' and po.approval_status = 'required')) as po_awaiting_approval,
    count(*) filter (where po.margin_at_risk
                       and po.status <> 'cancelled'
                       and po.margin_resolution is null)                            as po_margin_at_risk_unresolved,
    sum(po.grand_total) filter (where po.status in
      ('issued','viewed','acknowledged','supplier_amendment_requested','revised',
       'confirmed','in_production','ready_for_dispatch','dispatched',
       'partially_received','received'))                                           as supplier_committed_total
  from purchase_orders po where po.commercial_order_id = o.id
) pos on true
left join lateral (
  select
    count(*) filter (where sa.allocation_status not in ('cancelled','superseded'))  as allocation_count,
    count(*) filter (where sa.allocation_status not in ('cancelled','superseded')
                       and (sa.supplier_cost_total is null or sa.supplier_currency is null)) as allocations_missing_cost,
    sum(sa.supplier_cost_total) filter (where sa.allocation_status in
      ('unallocated','allocated','ready_for_po'))                                   as supplier_uncommitted_total
  from supplier_allocations sa where sa.commercial_order_id = o.id
) alc on true
left join lateral (
  select
    count(*)                                                                        as delivery_count,
    count(*) filter (where d.dispatch_status not in ('delivered','returned'))       as deliveries_open
  from deliveries d where d.commercial_order_id = o.id
) del on true
left join lateral (
  select
    count(*) filter (where i.status <> 'not_required')                              as installations_required,
    count(*) filter (where i.status = 'completed')                                  as installations_completed
  from installations i where i.commercial_order_id = o.id
) ins on true
left join lateral (
  select sum(si.gross_total) as total
  from sales_invoices si
  where si.commercial_order_id = o.id
    and si.status not in ('draft','pending_approval','void','cancelled')
) inv on true
left join lateral (
  select sum(p.amount) as total
  from payments p
  where p.commercial_order_id = o.id and p.status = 'confirmed'
) pay on true;

-- Per-PO supplier progress (per-maker view + lead-time history).
create or replace view vw_supplier_progress
with (security_invoker = on) as
select
  po.id,
  po.purchase_order_number,
  po.revision_number,
  po.commercial_order_id,
  o.order_number,
  po.manufacturer_id,
  a.name                     as manufacturer_name,
  po.status,
  po.approval_status,
  po.order_date,
  po.required_by_date,
  po.acknowledgement_due_date,
  po.acknowledged_at,
  po.expected_completion_date,
  po.issued_at,
  po.grand_total,
  po.supplier_currency,
  po.margin_at_risk,
  po.margin_resolution,
  (select count(*) from purchase_orders r
    where r.commercial_order_id = po.commercial_order_id
      and r.manufacturer_id is not distinct from po.manufacturer_id
      and r.purchase_order_number = po.purchase_order_number) - 1 as revision_churn,
  d.dispatched_at,
  d.delivered_at
from purchase_orders po
join commercial_orders o on o.id = po.commercial_order_id
left join artisans a on a.id = po.manufacturer_id
left join lateral (
  select max(dd.dispatched_at) as dispatched_at, max(dd.delivered_at) as delivered_at
  from deliveries dd
  where dd.commercial_order_id = po.commercial_order_id
    and dd.origin_manufacturer_id is not distinct from po.manufacturer_id
) d on true;

-- Per-order exposure snapshot (client money vs supplier commitments).
create or replace view vw_order_exposure
with (security_invoker = on) as
select
  o.id,
  o.order_number,
  o.status,
  o.currency,
  o.client_snapshot->>'company_name' as client_company,
  coalesce(inv.total, 0)  as client_invoiced,
  coalesce(pay.total, 0)  as client_paid_confirmed,
  coalesce(poc.total, 0)  as supplier_committed,
  coalesce(sac.total, 0)  as supplier_uncommitted,
  greatest(coalesce(poc.total, 0) - coalesce(pay.total, 0), 0) as net_exposure
from commercial_orders o
left join lateral (
  select sum(si.gross_total) as total from sales_invoices si
  where si.commercial_order_id = o.id
    and si.status not in ('draft','pending_approval','void','cancelled')
) inv on true
left join lateral (
  select sum(p.amount) as total from payments p
  where p.commercial_order_id = o.id and p.status = 'confirmed'
) pay on true
left join lateral (
  select sum(po.grand_total) as total from purchase_orders po
  where po.commercial_order_id = o.id and po.status in
    ('issued','viewed','acknowledged','supplier_amendment_requested','revised',
     'confirmed','in_production','ready_for_dispatch','dispatched',
     'partially_received','received')
) poc on true
left join lateral (
  select sum(sa.supplier_cost_total) as total from supplier_allocations sa
  where sa.commercial_order_id = o.id
    and sa.allocation_status in ('unallocated','allocated','ready_for_po')
) sac on true;

-- Views are read through the service role only; nothing is granted
-- to anon/authenticated (and invoker semantics + policy-less RLS
-- deny them anyway).
revoke all on vw_order_operations, vw_supplier_progress, vw_order_exposure from public, anon, authenticated;
grant select on vw_order_operations, vw_supplier_progress, vw_order_exposure to service_role;
