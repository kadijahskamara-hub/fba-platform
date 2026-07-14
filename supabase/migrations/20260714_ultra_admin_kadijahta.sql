-- ============================================================
-- Platform authority: Kadijahta (info@fullbloom.uk.com) becomes
-- Ultra Admin. Verified 2026-07-14: this is the only admin
-- account; admin@fullbloom.uk.com does not exist.
-- is_ultra_admin is DB-only (never in the JWT) and checked live
-- on every request (Sprint 1 design), so this takes effect
-- immediately on her next request — no re-login needed.
-- Idempotent and safe to re-run.
-- APPLIED to qnuqvdzguesetnevhsoc on 2026-07-14 via Supabase MCP.
-- ============================================================

update users
set is_ultra_admin = true
where lower(email) = 'info@fullbloom.uk.com'
  and role = 'admin'
  and status = 'active';
