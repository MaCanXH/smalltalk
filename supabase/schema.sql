-- ============================================================
-- Small Talk — Supabase schema (profiles, sessions, saved_phrases)
--
-- Run once in the Supabase SQL editor (SQL Editor → New query → Run).
-- Column names match the row<->type mapping in lib/cloud.ts. Re-running is
-- safe: tables use `if not exists` and policies are dropped before recreation.
-- ============================================================

-- ---------- profiles (1 row per user) ----------
create table if not exists public.profiles (
  id              uuid primary key references auth.users on delete cascade,
  name            text,
  handle          text,
  goal            text,
  native_language text,
  target_language text,
  joined_date     timestamptz,
  updated_at      timestamptz default now()
);

-- ---------- sessions (training results) ----------
create table if not exists public.sessions (
  id           text primary key,
  user_id      uuid not null references auth.users on delete cascade,
  date         timestamptz not null,
  topic        text,
  topic_label  text,
  duration_sec int,
  final_score  int,
  grade        text,
  vibe_emoji   text,
  data         jsonb not null,          -- full SessionResult (indices/suggestions/dialog/moments/…)
  created_at   timestamptz default now()
);
create index if not exists sessions_user_id_idx on public.sessions (user_id);

-- ---------- saved_phrases ----------
create table if not exists public.saved_phrases (
  id           text primary key,
  user_id      uuid not null references auth.users on delete cascade,
  text         text not null,
  kind         text not null,
  created_date timestamptz
);
create index if not exists saved_phrases_user_id_idx on public.saved_phrases (user_id);

-- ============================================================
-- Row Level Security — each user only sees/writes their own rows
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.sessions      enable row level security;
alter table public.saved_phrases enable row level security;

-- profiles: keyed by the user's own id
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- sessions: keyed by user_id
drop policy if exists "own sessions" on public.sessions;
create policy "own sessions" on public.sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- saved_phrases: keyed by user_id
drop policy if exists "own phrases" on public.saved_phrases;
create policy "own phrases" on public.saved_phrases
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
