-- Run in: Supabase Dashboard -> SQL Editor
-- Adds the must_change_password flag used to force a new password
-- after an admin issues a temporary one. Frontend tolerates the
-- column being absent, so this can be applied any time.

alter table users
  add column if not exists must_change_password boolean not null default false;
