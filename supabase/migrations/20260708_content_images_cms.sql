-- ============================================================
-- FBA Platform — Content Images CMS
-- Makes previously-hardcoded marketing images editable from the
-- admin control panel via site_settings (key → jsonb value).
--
-- Seeds current Pexels defaults so nothing changes visually until
-- an admin overrides them. Public reads via anon key (RLS SELECT
-- policy already permits it); writes go through the admin API on
-- the service_role key.
-- ============================================================

-- ── Home "Our Network" region cards ─────────────────────────
-- Full card editing: image, label, description, link. Ordered array.
INSERT INTO site_settings (key, value) VALUES (
  'network_regions',
  '{
    "cards": [
      { "label": "Southern Europe", "desc": "Italy · Portugal · Spain", "url": "https://images.pexels.com/photos/2422915/pexels-photo-2422915.jpeg?auto=compress&cs=tinysrgb&w=600", "alt": "Southern European craft", "href": "" },
      { "label": "Anatolia",        "desc": "Turkey",                   "url": "https://images.pexels.com/photos/2042109/pexels-photo-2042109.jpeg?auto=compress&cs=tinysrgb&w=600", "alt": "Anatolian craft",       "href": "" },
      { "label": "South Asia",      "desc": "India · Sri Lanka",        "url": "https://images.pexels.com/photos/2387873/pexels-photo-2387873.jpeg?auto=compress&cs=tinysrgb&w=600", "alt": "South Asian craft",     "href": "" },
      { "label": "Southeast Asia",  "desc": "Indonesia · Vietnam",      "url": "https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg?auto=compress&cs=tinysrgb&w=600", "alt": "Southeast Asian craft", "href": "" },
      { "label": "North Africa",    "desc": "Morocco · Egypt",          "url": "https://images.pexels.com/photos/3889855/pexels-photo-3889855.jpeg?auto=compress&cs=tinysrgb&w=600", "alt": "North African craft",   "href": "" }
    ]
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- ── Standalone content images (single {url, alt} each) ──────
-- Home "Three pillars / What We Do" full-width band background.
INSERT INTO site_settings (key, value) VALUES (
  'home_pillars_image',
  '{ "url": "https://images.pexels.com/photos/1838554/pexels-photo-1838554.jpeg?auto=compress&cs=tinysrgb&w=1920", "alt": "Luxury hotel — Full Bloom Artelier" }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- About page — "maker studio" portrait image beside the mission copy.
INSERT INTO site_settings (key, value) VALUES (
  'about_maker_image',
  '{ "url": "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=800", "alt": "FBA maker studio" }'::jsonb
) ON CONFLICT (key) DO NOTHING;
