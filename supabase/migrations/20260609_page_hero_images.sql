-- ============================================================
-- FBA Platform — Hero Image Settings for All Pages
-- Adds site_settings rows for: home, collection, artisans,
--   journal, about
-- value JSONB: { "url": "...", "alt": "..." }
-- ============================================================

INSERT INTO site_settings (key, value) VALUES
  ('home_hero_image',       '{"url": "", "alt": "Full Bloom Artelier — Design Procurement Studio"}'::jsonb),
  ('collection_hero_image', '{"url": "", "alt": "The FBA Collection — Limited Edition Pieces"}'::jsonb),
  ('artisans_hero_image',   '{"url": "", "alt": "Our artisan maker network"}'::jsonb),
  ('journal_hero_image',    '{"url": "", "alt": "FBA Journal — Ideas, process and craft"}'::jsonb),
  ('about_hero_image',      '{"url": "", "alt": "About Full Bloom Artelier"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
