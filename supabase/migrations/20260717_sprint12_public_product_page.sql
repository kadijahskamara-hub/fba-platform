-- Sprint 12 (public product page, 17 Jul 2026)
-- The same product must be saveable to a project more than once with
-- DIFFERENT finish configurations (md doc §9: product ID alone is not
-- the identity of a saved item). The unique pair constraint made that
-- impossible. The API keeps de-duplicating unconfigured adds in code.
alter table project_items drop constraint if exists project_items_project_id_product_id_key;
create index if not exists idx_project_items_project_product on project_items (project_id, product_id);
