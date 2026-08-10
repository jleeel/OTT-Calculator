-- Fixes a conflict introduced by 0003.
--
-- 0003 revoked anon's SELECT on public.entries, because that table now holds
-- edit_token. But the views were created `security_invoker = true`, which runs
-- them with the *caller's* privileges — so anon reading the board hit
-- "permission denied for table entries" and the leaderboard broke outright.
-- Caught by assuming the anon role, not by reading the DDL.
--
-- security_invoker was the right call in 0001, when anon could read the base
-- table and RLS was the boundary. It is the wrong call now. These views are
-- recreated as security definer (the Postgres default), so they run as their
-- owner and anon never needs rights on public.entries at all.
--
-- The security boundary moves from RLS to the view definitions themselves:
-- they list their columns explicitly, so edit_token cannot leak, and they
-- filter `deleted_at is null`, so removed entries cannot be read back. RLS on
-- public.entries stays enabled and still governs any direct access; anon simply
-- has none. Note this means the views are NOT filtered by RLS — if a
-- restrictive per-row policy is ever added to entries, these views must be
-- revisited or they will read past it.

drop view if exists public.leaderboard_current;

create view public.leaderboard_current as
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

drop view if exists public.entry_history;

create view public.entry_history as
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

revoke all on public.leaderboard_current from anon, authenticated;
revoke all on public.entry_history from anon, authenticated;

grant select on public.leaderboard_current to anon, authenticated;
grant select on public.entry_history to anon, authenticated;
