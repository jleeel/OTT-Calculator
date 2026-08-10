-- Rate-limit ledger for /diagnose.
--
-- One row per accepted photo. The route counts the rows for an address inside
-- the last hour and refuses past the cap. This lives in the database, not in
-- process memory, because on Vercel each request can land on a different
-- instance and an in-process counter would reset unpredictably — the same
-- reasoning as the leaderboard limiter, with different storage because a
-- cookie limit is a courtesy and every call here costs money.
--
-- No IP address is stored. `ip_hash` is an HMAC keyed by a server-side secret,
-- so the table is not a log of who visited, and rotating the secret resets the
-- counters rather than exposing anything.

create table if not exists public.diagnose_requests (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  created_at timestamptz not null default now()
);

-- The only query this table serves: rows for one hash, newest first.
create index if not exists diagnose_requests_ip_time_idx
  on public.diagnose_requests (ip_hash, created_at desc);

alter table public.diagnose_requests enable row level security;

-- ---------------------------------------------------------------------------
-- Grants
--
-- anon and authenticated get NOTHING here. There is no policy either, and no
-- grant to add later — nothing in the browser reads or writes this table. It
-- is touched only by the /api/diagnose route on the service role key.
--
-- See 0002: Supabase's defaults hand new tables in `public` the full privilege
-- set, including TRUNCATE, and TRUNCATE is not subject to RLS. So enabling RLS
-- is not enough on its own; the revoke below is what actually closes it, and it
-- is verified by assuming the anon role and attempting each operation.
-- ---------------------------------------------------------------------------

revoke all on public.diagnose_requests from anon, authenticated;
