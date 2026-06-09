-- ============================================================
-- FBA Platform — The Edit Filter Columns + Hero Image Setting
-- Adds: Technical Passport booleans, finish_type, origin_region,
--       lead_time_weeks on products
--       hero image seed in site_settings
-- ============================================================

-- ── PRODUCTS TABLE ───────────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS fire_retardant   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stain_proofed    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rub_count_40k    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_time_weeks  integer,
  ADD COLUMN IF NOT EXISTS finish_type      text,
  ADD COLUMN IF NOT EXISTS origin_region    text;

-- Indexes for filter queries
CREATE INDEX IF NOT EXISTS idx_products_fire_retardant  ON products(fire_retardant);
CREATE INDEX IF NOT EXISTS idx_products_stain_proofed   ON products(stain_proofed);
CREATE INDEX IF NOT EXISTS idx_products_rub_count_40k   ON products(rub_count_40k);
CREATE INDEX IF NOT EXISTS idx_products_lead_time_weeks ON products(lead_time_weeks);
CREATE INDEX IF NOT EXISTS idx_products_finish_type     ON products(finish_type);
CREATE INDEX IF NOT EXISTS idx_products_origin_region   ON products(origin_region);

-- ── SITE SETTINGS — HERO IMAGES ─────────────────────────────
-- Stores hero image URLs for page banners.
-- value is JSONB: { "url": "https://...", "alt": "..." }

INSERT INTO site_settings (key, value)
VALUES (
  'the_edit_hero_image',
  '{"url": "", "alt": "Curated craft and design pieces"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
