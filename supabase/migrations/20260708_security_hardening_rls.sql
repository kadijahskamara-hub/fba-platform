-- ============================================================
-- FBA Platform — Security hardening (Sprint 7)
-- Addresses Supabase security advisor findings.
-- ============================================================

-- 1. Pin trigger-function search_path (function_search_path_mutable).
--    Both functions only call now() (pg_catalog), so an empty
--    search_path is safe and prevents search_path hijacking.
ALTER FUNCTION public.update_updated_at() SET search_path = '';
ALTER FUNCTION public.set_site_settings_updated_at() SET search_path = '';

-- 2. Remove unused permissive anon INSERT policies (rls_policy_always_true).
--    Every public form (contact, service enquiry, trade application) is
--    inserted server-side via the service_role key, which bypasses RLS.
--    The anon INSERT path was never exercised by the app and only widened
--    the attack surface (anon-key bulk spam), so it is removed.
DROP POLICY IF EXISTS "Anon can submit contact records" ON public.contacts;
DROP POLICY IF EXISTS "Anon can submit service enquiries" ON public.service_enquiries;

-- NOTE (manual, not in this migration):
--  • Drop the _backup_*_20260706 tables once launch confidence is reached.
--  • Consider narrowing the `spec-documents` storage bucket SELECT policy so
--    clients can fetch object URLs but cannot LIST the whole bucket
--    (public_bucket_allows_listing). Spec docs are referenced by explicit
--    URL, so listing is not required by the app.
