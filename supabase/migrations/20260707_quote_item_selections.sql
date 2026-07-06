-- ============================================================
-- Sprint 4: carry selected finish/fabric/size through to quotes
-- (site brief §8.11 — quote requests must preserve product context)
-- ============================================================

alter table quote_request_items
  add column if not exists selected_finish text,
  add column if not exists selected_fabric text,
  add column if not exists selected_size   text;
