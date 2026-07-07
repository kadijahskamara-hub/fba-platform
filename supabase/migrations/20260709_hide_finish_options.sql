-- ============================================================
-- FBA — Manual visibility control for finish/colour swatches
-- Adds: hide_finish_options on products.
-- When true, the product page hides the Hard Finish / Upholstery
-- swatch sections even if finish rows exist (admin-controlled).
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS hide_finish_options boolean NOT NULL DEFAULT false;
