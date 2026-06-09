-- ============================================================
-- FBA Platform — Homepage Hero Settings
-- Full CMS control: image(s), headline, subtitle, CTAs.
-- images is an array to future-proof for slideshow / GIF.
-- ============================================================

INSERT INTO site_settings (key, value) VALUES (
  'home_hero_settings',
  '{
    "images": [
      {
        "url": "https://images.pexels.com/photos/29649745/pexels-photo-29649745.jpeg?auto=compress&cs=tinysrgb&w=1920",
        "alt": "Full Bloom Artelier — curated interiors"
      }
    ],
    "headline_1": "Global Craft.",
    "headline_2": "Delivered",
    "headline_3": "Precisely.",
    "subtitle": "Full Bloom Artelier connects interior designers, architects, and hospitality developers with the world''s finest makers — hand-vetted, technically compliant, and ready for your most demanding projects.",
    "cta_primary":      "Request Trade Access",
    "cta_primary_href": "/trade/apply",
    "cta_secondary":      "Browse the Edit",
    "cta_secondary_href": "/products"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
