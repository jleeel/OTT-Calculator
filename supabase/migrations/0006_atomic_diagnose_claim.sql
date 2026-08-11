-- 0006: make the /diagnose rate-limit claim atomic.
--
-- The claim used to be two round trips from the route — SELECT the window,
-- decide in JS, INSERT — so a burst of parallel requests from one address
-- could all pass the count before any insert landed, and every one of them
-- reached the paid model call. The decision has to happen where the data is,
-- under a lock.
--
-- The lock is a transaction-scoped advisory lock keyed on the address hash:
-- one claimant per address at a time, released automatically on commit or
-- rollback, and it serialises nothing across different addresses. A hashtext
-- collision between two addresses merely over-serialises them, which costs a
-- few milliseconds and protects the same invariant.
--
-- The function returns the in-window timestamps as they stood BEFORE this
-- claim, capped at p_max. The caller runs the same quota rule it always has
-- (fewer than p_max in the window = ok) and computes retry-after from the
-- timestamps; when the answer is ok, the row has already been inserted here,
-- atomically. Window arithmetic stays in one place (rate-limit.ts) and the
-- refusal maths cannot drift between SQL and JS.
--
-- Until this migration is applied the app falls back to the old two-step
-- claim and logs a warning — no worse than before, just not atomic.

create or replace function public.claim_diagnose_slot(
  p_ip_hash text,
  p_now timestamptz,
  p_window_seconds integer,
  p_max integer
) returns timestamptz[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_times timestamptz[];
begin
  perform pg_advisory_xact_lock(hashtext('diagnose:' || p_ip_hash));

  select coalesce(array_agg(created_at), '{}')
    into v_times
    from (
      select created_at
        from diagnose_requests
       where ip_hash = p_ip_hash
         and created_at >= p_now - make_interval(secs => p_window_seconds)
       order by created_at desc
       limit p_max
    ) recent;

  if coalesce(array_length(v_times, 1), 0) < p_max then
    insert into diagnose_requests (ip_hash, created_at)
    values (p_ip_hash, p_now);
  end if;

  return v_times;
end;
$$;

-- Only the service role calls this; anon has no business near the ledger.
-- (Migration 0005 already gave anon nothing on the table itself.)
revoke all on function public.claim_diagnose_slot(text, timestamptz, integer, integer)
  from public, anon, authenticated;
