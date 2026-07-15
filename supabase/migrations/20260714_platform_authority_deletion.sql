-- ============================================================
-- Sprint 7 Part B — Platform authority (Ultra Admin appointment)
-- and permanent account deletion.
-- APPLIED to qnuqvdzguesetnevhsoc on 2026-07-15 via Supabase MCP.
--
-- Kadijahta (info@fullbloom.uk.com) is already Ultra Admin
-- (20260714_ultra_admin_kadijahta.sql — applied + verified).
-- This migration adds:
--   1. user_status enum value 'deleted' (enum 3-change rule:
--      DB here, TypeScript in lib/types.ts, API allowlists).
--   2. A DB-level trigger guard: the platform must always retain
--      at least one ACTIVE Ultra Admin — any UPDATE/DELETE that
--      would leave zero is refused at the database level,
--      regardless of which code path attempts it.
--   3. set_ultra_admin(actor, target, grant) — atomic
--      appointment/revocation with self-revoke refusal and
--      full audit (actor + target + before/after).
--   4. delete_user_account(user, actor, reason) — atomic,
--      Ultra-only, two-step-final deletion: hard-deletes purely
--      personal/operational child rows, anonymises the user row
--      (PII stripped, credentials revoked, status='deleted');
--      financial/audit history survives via existing
--      SET NULL / NO ACTION FKs pointing at the anonymised row.
--
-- Child tables verified against the live schema (2026-07-15).
-- Hard-deleted (personal/operational, FK ON DELETE CASCADE):
--   cart_items, password_reset_tokens, staff_otps,
--   staff_permissions, projects (project_items cascade via
--   projects), trade_applications (user_id).
-- Kept, pointing at the anonymised row (SET NULL / NO ACTION):
--   audit_logs, issued_documents, commercial_orders, proformas,
--   sales_invoices, payments, refunds, credit_notes, deliveries,
--   proof_of_delivery, retail_orders, quote_requests,
--   journal_posts, product_analytics_events, trade_applications
--   (reviewed_by) and every *_by actor column.
--
-- House rules: SECURITY DEFINER fns revoked to service_role in
-- this same migration; immutability of financial history is
-- preserved by design (no financial rows are touched).
-- ============================================================

-- 1 ── enum: user_status gains 'deleted' -----------------------
alter type user_status add value if not exists 'deleted';

-- Partial index used by the last-Ultra guard + authority screens.
create index if not exists idx_users_active_ultra
  on users (id) where is_ultra_admin and status = 'active';

-- 2 ── DB-level last-Ultra guard -------------------------------
create or replace function protect_last_ultra_admin()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_remaining int;
begin
  -- Only relevant when an ACTIVE Ultra Admin is being removed,
  -- demoted, or deactivated (archive/suspend/delete all count).
  if old.is_ultra_admin and old.status = 'active' then
    if tg_op = 'DELETE'
       or new.is_ultra_admin = false
       or new.status <> 'active' then
      select count(*) into v_remaining
      from users
      where is_ultra_admin
        and status = 'active'
        and id <> old.id;
      if v_remaining = 0 then
        raise exception 'LAST_ULTRA_ADMIN: the platform must always retain at least one active Ultra Admin';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_last_ultra_admin on users;
create trigger trg_protect_last_ultra_admin
  before update or delete on users
  for each row execute function protect_last_ultra_admin();

-- 3 ── Ultra Admin appointment / revocation --------------------
create or replace function set_ultra_admin(
  p_actor  uuid,
  p_target uuid,
  p_grant  boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  users%rowtype;
  v_target users%rowtype;
begin
  select * into v_actor from users where id = p_actor;
  if not found or v_actor.status <> 'active' or not v_actor.is_ultra_admin then
    raise exception 'FORBIDDEN: only an active Ultra Admin can grant or revoke platform authority';
  end if;

  select * into v_target from users where id = p_target for update;
  if not found then
    raise exception 'NOT_FOUND: target account does not exist';
  end if;
  if v_target.role <> 'admin' then
    raise exception 'INVALID_TARGET: Ultra Admin authority can only be held by admin accounts';
  end if;
  if v_target.status <> 'active' then
    raise exception 'INVALID_TARGET: target account is not active';
  end if;

  if not p_grant and p_actor = p_target then
    raise exception 'SELF_REVOKE: an Ultra Admin cannot revoke their own authority';
  end if;

  if v_target.is_ultra_admin = p_grant then
    return jsonb_build_object('changed', false, 'is_ultra_admin', p_grant);
  end if;

  -- trg_protect_last_ultra_admin additionally refuses a revoke
  -- that would leave zero active Ultra Admins.
  update users
  set is_ultra_admin = p_grant, updated_at = now()
  where id = p_target;

  insert into audit_logs (actor_id, actor_email, action, entity_type, entity_id, before_value, after_value)
  values (
    p_actor, v_actor.email,
    case when p_grant then 'ultra_admin.granted' else 'ultra_admin.revoked' end,
    'user', p_target::text,
    jsonb_build_object('email', v_target.email, 'role', v_target.role, 'is_ultra_admin', v_target.is_ultra_admin),
    jsonb_build_object('email', v_target.email, 'role', v_target.role, 'is_ultra_admin', p_grant)
  );

  return jsonb_build_object('changed', true, 'is_ultra_admin', p_grant);
end;
$$;

-- 4 ── Permanent account deletion (any user type) --------------
create or replace function delete_user_account(
  p_user_id uuid,
  p_actor   uuid,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    users%rowtype;
  v_target   users%rowtype;
  v_shortid  text;
  v_email    text;
  v_snapshot jsonb;
  v_remaining int;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: a deletion reason must be provided';
  end if;

  select * into v_actor from users where id = p_actor;
  if not found or v_actor.status <> 'active' or not v_actor.is_ultra_admin then
    raise exception 'FORBIDDEN: account deletion is an Ultra Admin power';
  end if;

  if p_user_id = p_actor then
    raise exception 'SELF_DELETE: you cannot delete your own account';
  end if;

  select * into v_target from users where id = p_user_id for update;
  if not found then
    raise exception 'NOT_FOUND: target account does not exist';
  end if;
  if v_target.status = 'deleted' then
    raise exception 'ALREADY_DELETED: this account has already been deleted';
  end if;

  -- Explicit last-Ultra check (the trigger is the backstop).
  if v_target.is_ultra_admin and v_target.status = 'active' then
    select count(*) into v_remaining
    from users
    where is_ultra_admin and status = 'active' and id <> v_target.id;
    if v_remaining = 0 then
      raise exception 'LAST_ULTRA_ADMIN: the platform must always retain at least one active Ultra Admin';
    end if;
  end if;

  -- Snapshot BEFORE anonymisation (no password hash in the audit).
  v_snapshot := to_jsonb(v_target) - 'password_hash';

  -- (a) Hard-delete purely personal/operational rows — the
  -- tables whose user FKs are ON DELETE CASCADE by design.
  -- Explicit deletes are required because the user row itself is
  -- never deleted (it is anonymised), so CASCADE never fires.
  -- Financial and audit tables are NOT touched (their FKs are
  -- SET NULL / NO ACTION and keep pointing at the anonymised row).
  delete from cart_items            where user_id = p_user_id;
  delete from password_reset_tokens where user_id = p_user_id;
  delete from staff_otps            where user_id = p_user_id;
  delete from staff_permissions     where user_id = p_user_id;
  delete from projects              where user_id = p_user_id;
  delete from trade_applications    where user_id = p_user_id;

  -- (b) Anonymise the user row: strip PII, revoke credentials,
  -- mark deleted. The row survives so SET NULL / NO ACTION FKs
  -- (orders, invoices, payments, PODs, issued documents, audit
  -- logs) keep their referential integrity with zero PII.
  v_shortid := substr(replace(p_user_id::text, '-', ''), 1, 12);
  v_email   := 'deleted-user-' || v_shortid || '@removed.invalid';

  update users set
    first_name           = 'Deleted',
    last_name            = 'User',
    email                = v_email,
    phone                = null,
    avatar_url           = null,
    password_hash        = '!deleted!' || md5(gen_random_uuid()::text),
    must_change_password = false,
    is_ultra_admin       = false,
    status               = 'deleted',
    updated_at           = now()
  where id = p_user_id;

  -- (c) Full audit entry: actor, target snapshot-before, reason.
  insert into audit_logs (actor_id, actor_email, action, entity_type, entity_id, before_value, after_value)
  values (
    p_actor, v_actor.email, 'user.deleted', 'user', p_user_id::text,
    v_snapshot,
    jsonb_build_object('status', 'deleted', 'email', v_email, 'reason', trim(p_reason))
  );

  return jsonb_build_object(
    'deleted', true,
    'user_id', p_user_id,
    'anonymised_email', v_email,
    'previous_role', v_target.role
  );
end;
$$;

-- 5 ── Lock down: service_role only (same-migration rule) ------
revoke all on function protect_last_ultra_admin() from public, anon, authenticated;
revoke all on function set_ultra_admin(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function delete_user_account(uuid, uuid, text) from public, anon, authenticated;
grant execute on function set_ultra_admin(uuid, uuid, boolean) to service_role;
grant execute on function delete_user_account(uuid, uuid, text) to service_role;
