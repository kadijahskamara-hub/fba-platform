-- Password reset tokens
-- Used by the forgot-password / reset-password flow.
-- Tokens are stored as bcrypt hashes (never plaintext).

create table if not exists public.password_reset_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Index for fast lookup by token hash
create index if not exists idx_password_reset_tokens_token_hash
  on public.password_reset_tokens (token_hash);

-- Index for housekeeping / expiry queries
create index if not exists idx_password_reset_tokens_user_id
  on public.password_reset_tokens (user_id);

-- RLS: only service-role (supabaseAdmin) can touch this table
alter table public.password_reset_tokens enable row level security;
