-- ============================================================
-- FBA / Full Bloom Artelier — Product Material Configuration
-- Adds: is_fba_home flag on products
--       Full material/finish config columns on product_specifications
--       (generic seating/accessories, table-specific, extended lighting)
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── PRODUCTS TABLE ───────────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_fba_home boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_fba_home ON products(is_fba_home);


-- ── PRODUCT SPECIFICATIONS — GENERIC MATERIAL CONFIG ─────────
-- Applies to seating, accessories, and any configurable product

ALTER TABLE product_specifications
  -- Frame
  ADD COLUMN IF NOT EXISTS frame_material               text,
  ADD COLUMN IF NOT EXISTS frame_material_options        text,
  ADD COLUMN IF NOT EXISTS frame_finish_colour_options   text,
  -- Armrests
  ADD COLUMN IF NOT EXISTS armrest_material              text,
  ADD COLUMN IF NOT EXISTS armrest_finish_colour_options text,
  -- Seat & back
  ADD COLUMN IF NOT EXISTS seat_material                 text,
  ADD COLUMN IF NOT EXISTS back_material                 text,
  ADD COLUMN IF NOT EXISTS seat_back_upholstery_options  text,
  -- Legs
  ADD COLUMN IF NOT EXISTS upholstered_legs_colour_options text,
  -- Other config
  ADD COLUMN IF NOT EXISTS glides                        text,
  ADD COLUMN IF NOT EXISTS stackable                     boolean,
  ADD COLUMN IF NOT EXISTS indoor_outdoor_use            text,
  ADD COLUMN IF NOT EXISTS footprint_m2                  numeric(8,3),
  ADD COLUMN IF NOT EXISTS shipping_volume_m3            numeric(8,3),
  ADD COLUMN IF NOT EXISTS other_available_options       text;


-- ── PRODUCT SPECIFICATIONS — TABLE-SPECIFIC CONFIG ───────────

ALTER TABLE product_specifications
  -- Legs
  ADD COLUMN IF NOT EXISTS leg_material                  text,
  ADD COLUMN IF NOT EXISTS leg_material_options          text,
  ADD COLUMN IF NOT EXISTS leg_finish_colour_options     text,
  -- Top
  ADD COLUMN IF NOT EXISTS top_material                  text,
  ADD COLUMN IF NOT EXISTS top_material_options          text,
  ADD COLUMN IF NOT EXISTS top_thickness_mm              numeric(6,1),
  ADD COLUMN IF NOT EXISTS top_finish_colour_options     text,
  ADD COLUMN IF NOT EXISTS top_shape_options             text,
  ADD COLUMN IF NOT EXISTS top_size_options              text,
  -- Base / feet
  ADD COLUMN IF NOT EXISTS base_pedestal_type            text,
  ADD COLUMN IF NOT EXISTS feet_glides                   text,
  ADD COLUMN IF NOT EXISTS suitable_table_top_sizes      text,
  ADD COLUMN IF NOT EXISTS extension_options             text;


-- ── PRODUCT SPECIFICATIONS — EXTENDED LIGHTING CONFIG ────────
-- Supplements existing: bulb_type, wattage, voltage, plug_type,
--                       cable_length, dimmable, ip_rating

ALTER TABLE product_specifications
  -- Body materials
  ADD COLUMN IF NOT EXISTS body_frame_material           text,
  ADD COLUMN IF NOT EXISTS base_material                 text,
  ADD COLUMN IF NOT EXISTS diffuser_shade_material       text,
  ADD COLUMN IF NOT EXISTS fringes_trim_material         text,
  -- Colour options
  ADD COLUMN IF NOT EXISTS body_frame_colour_options     text,
  ADD COLUMN IF NOT EXISTS base_colour_options           text,
  ADD COLUMN IF NOT EXISTS diffuser_shade_colour_options text,
  ADD COLUMN IF NOT EXISTS fringes_colour_options        text,
  -- Use / power
  ADD COLUMN IF NOT EXISTS suitable_for                  text,
  ADD COLUMN IF NOT EXISTS rechargeable                  boolean,
  ADD COLUMN IF NOT EXISTS battery_life                  text,
  -- Light source
  ADD COLUMN IF NOT EXISTS light_source_type             text,
  ADD COLUMN IF NOT EXISTS recommended_light_source      text,
  ADD COLUMN IF NOT EXISTS lumens                        text,
  ADD COLUMN IF NOT EXISTS colour_temperature            text,
  ADD COLUMN IF NOT EXISTS average_life_light_source     text,
  ADD COLUMN IF NOT EXISTS spare_parts_available         text,
  ADD COLUMN IF NOT EXISTS lighting_spec_notes           text;
