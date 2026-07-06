-- ============================================================
-- Sprint 3: product_health view — completeness scoring for the
-- admin table + dashboard data-health cards. 11 checks, score 0-100.
-- security_invoker so anon access respects products RLS.
-- ============================================================

create or replace view product_health
with (security_invoker = on) as
select
  p.id,
  p.visibility,
  p.archived_at,
  p.deleted_at,
  coalesce(array_length(p.images, 1), 0)                                        as image_count,
  (coalesce(array_length(p.images, 1), 0) >= 1)                                 as has_hero_image,
  (coalesce(array_length(p.images, 1), 0) >= 3)                                 as has_three_images,
  (p.category_id is not null)                                                   as has_category,
  (p.artisan_id is not null)                                                    as has_artisan,
  (coalesce(p.shipping_origin, '') <> '' or coalesce(p.origin_region, '') <> '') as has_origin,
  (coalesce(p.short_description, '') <> '')                                     as has_short_description,
  (coalesce(p.technical_description, '') <> '')                                 as has_technical_description,
  (coalesce(p.lead_time, '') <> '' or p.lead_time_weeks is not null or p.lead_time_min_weeks is not null) as has_lead_time,
  (coalesce(p.seo_title, '') <> '' and coalesce(p.seo_description, '') <> '')   as has_seo,
  exists (select 1 from product_documents d where d.product_id = p.id and d.document_type = 'product_specification') as has_spec_doc,
  exists (select 1 from product_finishes f where f.product_id = p.id)           as has_finishes,
  (
    ( (coalesce(array_length(p.images, 1), 0) >= 1)::int
    + (coalesce(array_length(p.images, 1), 0) >= 3)::int
    + (p.category_id is not null)::int
    + (p.artisan_id is not null)::int
    + (coalesce(p.shipping_origin, '') <> '' or coalesce(p.origin_region, '') <> '')::int
    + (coalesce(p.short_description, '') <> '')::int
    + (coalesce(p.technical_description, '') <> '')::int
    + (coalesce(p.lead_time, '') <> '' or p.lead_time_weeks is not null or p.lead_time_min_weeks is not null)::int
    + (coalesce(p.seo_title, '') <> '' and coalesce(p.seo_description, '') <> '')::int
    + exists (select 1 from product_documents d where d.product_id = p.id and d.document_type = 'product_specification')::int
    + exists (select 1 from product_finishes f where f.product_id = p.id)::int
    ) * 100 / 11
  )                                                                             as completeness
from products p;
