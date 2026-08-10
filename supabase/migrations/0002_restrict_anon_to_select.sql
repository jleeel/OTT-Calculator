-- Restrict anon (and authenticated) to SELECT only.
--
-- Why this exists: 0001 enabled RLS with a select-only policy, which reads as
-- "anon can only select". It is not. Supabase's default privileges grant anon
-- and authenticated the full set on new tables in `public` — INSERT, UPDATE,
-- DELETE, TRUNCATE, REFERENCES, TRIGGER. RLS then blocks the DML, so the data
-- looked safe.
--
-- TRUNCATE is not subject to RLS. Verified against the live database by
-- assuming the anon role: `truncate public.entries` succeeded (rolled back).
-- The grant alone let anon empty the table.
--
-- Not remotely reachable with just the publishable key — PostgREST only issues
-- SELECT/INSERT/UPDATE/DELETE and never TRUNCATE — but the grants contradicted
-- the stated model, and RLS was the single point of failure for writes.
--
-- After this migration, anon is refused at the permission layer with
-- "permission denied for table entries" for INSERT, UPDATE, DELETE and
-- TRUNCATE, with RLS as a second line rather than the only one.
--
-- Applies to these two objects only. Any new table needs the same treatment,
-- or fix Supabase's default privileges for the `public` schema.

revoke all on public.entries from anon, authenticated;
revoke all on public.leaderboard_current from anon, authenticated;

grant select on public.entries to anon, authenticated;
grant select on public.leaderboard_current to anon, authenticated;
