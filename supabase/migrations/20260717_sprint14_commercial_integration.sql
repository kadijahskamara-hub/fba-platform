-- Sprint 14 (commercial integration, 17 Jul 2026)
-- Exact configuration lineage from project board to quote: a quote
-- request item now remembers WHICH project item it came from, so the
-- conversion can copy that item's finish selections precisely (the same
-- product can appear twice with different configurations).
alter table quote_request_items
  add column if not exists project_item_id uuid references project_items(id) on delete set null;
