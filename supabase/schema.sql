-- ============================================================
-- Small Talk — Supabase schema (profiles, sessions, saved_items, …)
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

-- ---------- saved_phrases (legacy — superseded by saved_items) ----------
create table if not exists public.saved_phrases (
  id           text primary key,
  user_id      uuid not null references auth.users on delete cascade,
  text         text not null,
  kind         text not null,
  created_date timestamptz
);
create index if not exists saved_phrases_user_id_idx on public.saved_phrases (user_id);

-- ---------- saved_items (bookmarked vocab + AI suggestions) ----------
-- Backs Library → Saved. Like `sessions`, the full domain object rides in a
-- `data` jsonb column, with `type` ('phrase' | 'suggestion') and `created_date`
-- promoted for querying. Replaces the flat `saved_phrases` table; the client
-- migrates any local legacy phrases into this shape on first read.
create table if not exists public.saved_items (
  id           text primary key,
  user_id      uuid not null references auth.users on delete cascade,
  type         text not null,
  created_date timestamptz,
  data         jsonb not null
);
create index if not exists saved_items_user_id_idx on public.saved_items (user_id);

-- ---------- vapi_call_grants (one row per issued voice-session token) ----------
-- Written only by the Edge Function (service role) when /api/vapi/session
-- mints a Vapi call token; used to enforce the per-user daily session limit.
create table if not exists public.vapi_call_grants (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists vapi_call_grants_user_time_idx
  on public.vapi_call_grants (user_id, created_at);

-- ---------- call_reports (Vapi end-of-call webhook payloads) ----------
-- Written only by the vapi-webhook Edge Function (service role). One row per
-- Vapi call — the canonical transcript/summary/cost, keyed by Vapi's call id
-- (upserts make webhook retries idempotent). `user_id` comes from the
-- metadata stamped on the call by /api/vapi/session; SessionResult.vapiCallId
-- in the app joins a local session to its row here.
create table if not exists public.call_reports (
  call_id      text primary key,
  user_id      uuid references auth.users on delete cascade,
  ended_reason text,
  duration_sec numeric,
  cost         numeric,
  summary      text,
  transcript   text,
  report       jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists call_reports_user_id_idx on public.call_reports (user_id);

-- ---------- hot_topics_cache (server-side topic-pack cache) ----------
-- Written only by the api Edge Function (service role). One row: the latest
-- generated topic pack, served to all users for ~20 min so the news feeds and
-- Groq run a few times per hour instead of on every Talk-tab load (Google
-- rate-limits the shared egress IP when hammered). Stale rows are served in
-- preference to canned fallbacks when regeneration fails.
create table if not exists public.hot_topics_cache (
  cache_key  text primary key,
  topics     jsonb not null,
  source     text,
  created_at timestamptz not null default now()
);

-- ---------- scene_presets (default practice scenes) ----------
-- The pool of pre-authored scenarios the Scene tab draws a *random* default
-- from (Quick Talk, the Talk tab's no-topic start, and the "Last scene"
-- fallback before the user has ever defined their own). Read only by the api
-- Edge Function (service role): GET /api/scene/default returns one random
-- active row's display fields (slug/label/emoji/scene), and /api/vapi/session
-- looks up `prompt` + `first_message` by slug to build the assistant directly
-- — no Groq at runtime for defaults. Clients never read this table directly.
-- `prompt` is a COMPLETE, drop-in assistant system prompt (character +
-- personality + style + safety); `first_message` is the AI's opening line.
-- Seed with supabase/scene_presets_seed.sql.
create table if not exists public.scene_presets (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  emoji         text,
  label         text not null,
  scene         text not null,
  prompt        text not null,
  first_message text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists scene_presets_active_idx
  on public.scene_presets (active);

-- ============================================================
-- Row Level Security — each user only sees/writes their own rows
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.sessions      enable row level security;
alter table public.saved_phrases enable row level security;
alter table public.saved_items   enable row level security;

-- vapi_call_grants: RLS on with NO policies — only the service role (used by
-- the Edge Function) can read or write; clients have no access at all.
alter table public.vapi_call_grants enable row level security;

-- hot_topics_cache: RLS on with NO policies — service role only; clients get
-- topics through the Edge Function, never from this table directly.
alter table public.hot_topics_cache enable row level security;

-- scene_presets: RLS on with NO policies — service role only; clients get a
-- random default scene through the Edge Function, never from this table.
alter table public.scene_presets enable row level security;

-- call_reports: users may READ their own reports (canonical transcripts);
-- writes stay service-role-only (no insert/update policy).
alter table public.call_reports enable row level security;
drop policy if exists "own call reports" on public.call_reports;
create policy "own call reports" on public.call_reports
  for select
  using (auth.uid() = user_id);

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

-- saved_items: keyed by user_id
drop policy if exists "own saved items" on public.saved_items;
create policy "own saved items" on public.saved_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
