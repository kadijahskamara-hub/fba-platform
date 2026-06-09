-- ============================================================
-- FBA Platform — Site Settings (feature flags & platform config)
-- ============================================================

CREATE TABLE IF NOT EXISTS site_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION set_site_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_site_settings_updated_at
  BEFORE UPDATE ON site_settings
  FOR EACH ROW EXECUTE FUNCTION set_site_settings_updated_at();

-- ── Seed: launch flags ───────────────────────────────────────
-- All flags default to true (fully live). Admin can turn them off
-- to show "Coming Soon" on individual sections before launch.

INSERT INTO site_settings (key, value) VALUES (
  'launch_flags',
  '{
    "show_collection": true,
    "show_home":       true,
    "show_artisans":   true,
    "show_journal":    true,
    "show_trade_cta":  true
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Public can read (anon key used in lib/flags.ts)
CREATE POLICY "public_read_site_settings"
  ON site_settings FOR SELECT
  USING (true);

-- No public write — admin API uses service_role key which bypasses RLS
