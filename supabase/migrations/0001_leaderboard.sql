-- Giant pumpkin leaderboard — initial schema
--
-- No local Supabase CLI is required. Paste this whole file into the Supabase
-- dashboard: SQL Editor -> New query -> Run.  `npm run migration:print` prints
-- it to the console for copying.
--
-- gen_random_uuid() is built into Postgres 13+, so no extension is needed on
-- any current Supabase project.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  grower_name text not null,
  location text not null,
  pumpkin_name text not null,
  circumference numeric not null,
  side_to_side numeric not null,
  end_to_end numeric not null,
  ott numeric generated always as
    (circumference + side_to_side + end_to_end) stored,
  estimated_lbs numeric not null,
  pollination_date date,
  measured_on date not null,
  created_at timestamptz default now()
);

create index if not exists entries_ott_desc_idx
  on public.entries (ott desc);

create index if not exists entries_grower_pumpkin_idx
  on public.entries (grower_name, pumpkin_name);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Anon gets SELECT and nothing else. There is deliberately no INSERT, UPDATE,
-- or DELETE policy: every write goes through POST /api/leaderboard/entries,
-- which is passcode-gated and uses the service role key (which bypasses RLS).
-- The service key must never reach the client.
-- ---------------------------------------------------------------------------

alter table public.entries enable row level security;

drop policy if exists "entries are publicly readable" on public.entries;
create policy "entries are publicly readable"
  on public.entries
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Leaderboard view
--
-- The board shows one row per pumpkin — each grower+pumpkin's most recent
-- measurement — so a grower who logs weekly does not fill the board. Kept as a
-- view because PostgREST cannot express DISTINCT ON.
--
-- security_invoker = true makes the view run with the caller's privileges, so
-- the RLS policy on public.entries still applies to anyone reading it.
-- ---------------------------------------------------------------------------

create or replace view public.leaderboard_current
with (security_invoker = true) as
select distinct on (grower_name, pumpkin_name)
  id,
  grower_name,
  location,
  pumpkin_name,
  circumference,
  side_to_side,
  end_to_end,
  ott,
  estimated_lbs,
  pollination_date,
  measured_on,
  created_at
from public.entries
order by grower_name, pumpkin_name, measured_on desc, created_at desc;

-- Supabase grants these by default for new tables in `public`; stated
-- explicitly so a project with tightened default privileges still works.
grant select on public.entries to anon, authenticated;
grant select on public.leaderboard_current to anon, authenticated;
