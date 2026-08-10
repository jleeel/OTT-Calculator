-- Leaderboard second pass: ownership tokens, soft delete, plausibility flags,
-- and a growers table for manual verification.
--
-- Two rules this migration exists to enforce:
--   1. edit_token must NEVER be readable by anon. It is the only thing standing
--      between a stranger and deleting someone else's entry.
--   2. The anon-readable view must hide soft-deleted rows.
-- Both are handled by revoking direct table SELECT from anon and pointing anon
-- at a view that lists columns explicitly. Column-level grants alone would not
-- be enough, because `select *` through PostgREST would still surface the
-- token to anyone who guessed the column existed.

alter table public.entries
  add column if not exists edit_token uuid default gen_random_uuid();

alter table public.entries
  add column if not exists deleted_at timestamptz;

alter table public.entries
  add column if not exists flags text[] default '{}';

-- Live rows only; the board never counts deleted entries.
create index if not exists entries_live_ott_idx
  on public.entries (ott desc)
  where deleted_at is null;

create table if not exists public.growers (
  id uuid primary key default gen_random_uuid(),
  grower_name text not null unique,
  verified boolean default false,
  verified_note text,
  created_at timestamptz default now()
);

alter table public.growers enable row level security;

drop policy if exists "growers are publicly readable" on public.growers;
create policy "growers are publicly readable"
  on public.growers
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Views
--
-- Rebuilt to exclude edit_token and soft-deleted rows, and to carry the
-- grower's verification state so the board does not need a second round trip.
-- ---------------------------------------------------------------------------

drop view if exists public.leaderboard_current;

create view public.leaderboard_current
with (security_invoker = true) as
select distinct on (e.grower_name, e.pumpkin_name)
  e.id,
  e.grower_name,
  e.location,
  e.pumpkin_name,
  e.circumference,
  e.side_to_side,
  e.end_to_end,
  e.ott,
  e.estimated_lbs,
  e.pollination_date,
  e.measured_on,
  e.created_at,
  e.flags,
  coalesce(g.verified, false) as grower_verified,
  g.verified_note as grower_verified_note
from public.entries e
left join public.growers g on g.grower_name = e.grower_name
where e.deleted_at is null
order by e.grower_name, e.pumpkin_name, e.measured_on desc, e.created_at desc;

-- Full history for one pumpkin, expanded from a board row. Same exclusions.
create or replace view public.entry_history
with (security_invoker = true) as
select
  e.id,
  e.grower_name,
  e.pumpkin_name,
  e.ott,
  e.estimated_lbs,
  e.measured_on,
  e.flags
from public.entries e
where e.deleted_at is null;

-- ---------------------------------------------------------------------------
-- Grants
--
-- anon loses SELECT on public.entries entirely — that table now holds
-- edit_token. Everything anon reads goes through the two views above, which
-- list their columns explicitly and filter out deleted rows.
--
-- See 0002: Supabase's defaults hand new tables the full privilege set, so
-- every new object needs an explicit revoke. Verified by assuming the role.
-- ---------------------------------------------------------------------------

revoke all on public.entries from anon, authenticated;
revoke all on public.growers from anon, authenticated;
revoke all on public.leaderboard_current from anon, authenticated;
revoke all on public.entry_history from anon, authenticated;

grant select on public.growers to anon, authenticated;
grant select on public.leaderboard_current to anon, authenticated;
grant select on public.entry_history to anon, authenticated;
