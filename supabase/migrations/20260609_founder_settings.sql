-- ============================================================
-- FBA Platform — Founder Section Settings
-- Adds founder_settings to site_settings so admins can
-- show/hide and edit the founder section on About + Home.
-- ============================================================

INSERT INTO site_settings (key, value) VALUES (
  'founder_settings',
  '{
    "show_on_about": true,
    "show_on_home": true,
    "show_image": true,
    "name": "Kadijahta Kamara",
    "title": "Founder & Creative Director",
    "bio": "A luxury FF&E specialist with over a decade of experience across high-end residential, hospitality, and cruise line interiors. Kadijahta has delivered projects from £2M to £20M across the UK, Europe, Asia, and West Africa — building a deeply personal network of global makers that is the foundation of everything Full Bloom Artelier does.",
    "bio_2": "She brings a rare combination of creative vision, technical precision, and the kind of relationships with manufacturers that take years to build properly.",
    "tags": "FF&E Specialist,Global Sourcing,Hospitality,Interior Architecture,Bespoke Design",
    "previously": "KCA International · SMC Design · GA Group · Russell Sage Studio"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
