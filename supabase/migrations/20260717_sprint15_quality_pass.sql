-- Sprint 15 (quality pass, 17 Jul 2026)
-- Covering indexes for the foreign keys added in Sprints 10-14 (advisor
-- class: unindexed_foreign_keys). These serve FK cascade/restrict checks
-- and the join paths used by conversion, admin queues and ops exceptions.

create index if not exists idx_qri_quote_request on quote_request_items (quote_request_id);
create index if not exists idx_qri_product on quote_request_items (product_id);
create index if not exists idx_qri_project_item on quote_request_items (project_item_id) where project_item_id is not null;

create index if not exists idx_cmr_material_type on custom_match_requests (material_type_id) where material_type_id is not null;
create index if not exists idx_cmr_assigned_to on custom_match_requests (assigned_to) where assigned_to is not null;
create index if not exists idx_cmr_line on custom_match_requests (proforma_line_item_id) where proforma_line_item_id is not null;
create index if not exists idx_cmr_project on custom_match_requests (project_id) where project_id is not null;
create index if not exists idx_cmr_project_item on custom_match_requests (project_item_id) where project_item_id is not null;
create index if not exists idx_cmr_quote_request on custom_match_requests (quote_request_id) where quote_request_id is not null;
create index if not exists idx_cmr_requester on custom_match_requests (requester_user_id) where requester_user_id is not null;
create index if not exists idx_cma_uploaded_by on custom_match_attachments (uploaded_by) where uploaded_by is not null;

create index if not exists idx_fcr_target on finish_compatibility_rules (target_finish_option_id);
create index if not exists idx_pfg_material_type on product_finish_groups (material_type_id) where material_type_id is not null;
create index if not exists idx_pfo_finish on product_finish_options (finish_id);
create index if not exists idx_pm_finish_option on product_media (finish_option_id) where finish_option_id is not null;
create index if not exists idx_ppa_verified_by on product_passport_attributes (verified_by) where verified_by is not null;

create index if not exists idx_pifs_group on project_item_finish_selections (finish_group_id) where finish_group_id is not null;
create index if not exists idx_pifs_option on project_item_finish_selections (finish_option_id) where finish_option_id is not null;
create index if not exists idx_pifs_finish on project_item_finish_selections (finish_id) where finish_id is not null;
create index if not exists idx_qifs_group on quote_item_finish_selections (finish_group_id) where finish_group_id is not null;
create index if not exists idx_qifs_option on quote_item_finish_selections (finish_option_id) where finish_option_id is not null;
create index if not exists idx_qifs_finish on quote_item_finish_selections (finish_id) where finish_id is not null;
