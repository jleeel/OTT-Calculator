# Giant Pumpkin OTT Calculator — project context

Over-the-top (OTT) weight calculator, growth log, and season leaderboard for
giant pumpkin growers.

## Stack and deploy target

Next.js (App Router) · TypeScript · Tailwind CSS v4 · Supabase · Vercel.

This deploys as **its own Vercel project on its own subdomain**. It is separate
from well-registration — separate project, separate domain, separate Supabase
tables. Do not fold this into that codebase or share its deployment config.

## Supabase API keys

Supabase has moved to **`sb_publishable_…` / `sb_secret_…`** keys. These replace
the legacy JWT `anon` and `service_role` keys — they are opaque strings, not
JWTs, and nothing in this codebase may try to decode one.

The env var names still say `ANON_KEY` / `SERVICE_ROLE_KEY` because they name
the *role*, not the key format. Put the publishable key in
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and the secret key in
`SUPABASE_SERVICE_ROLE_KEY`. Legacy JWT keys still work if a project has them.

**Both installed clients accept the new formats** — verified against the vendored
source, not assumed:

- `@supabase/supabase-js` **2.112.2** has explicit handling in `src/lib/fetch.ts`.
  `isNewApiKey()` recognises the two prefixes; new-format keys go in the `apikey`
  header and are kept out of the `Authorization: Bearer` fallback where that
  would be wrong. `checkApiKeyFormat()` warns once per unrecognised `sb_*`
  subtype and **never throws** — the server decides key validity, not the SDK.
- `@supabase/ssr` **0.12.4** does no key parsing at all; it is cookie and session
  plumbing and hands the key straight through.

If either package is downgraded below the version that added `isNewApiKey`,
re-check this before assuming new-format keys still work.

## The formula

`src/lib/ott.ts` is the **single source of truth** for weight estimation.
Nothing else in the codebase may reimplement it — not the client, not a route
handler, not a SQL function. Import it.

Source: the 2025 GPC (Great Pumpkin Commonwealth) Atlantic Giant OTT chart.
`ott` is the sum of three tape measurements in inches — circumference, side to
side, end to end.

```
a      = (12.81 / (1 + 6.87 * 2^(-ott/97)))^3
b      = (ott / 45.9)^3.014
weight = max(0, a + b - 10)
```

The estimate carries roughly ±5% and assumes Atlantic Giant genetics. Wall
thickness is what drives heavy-to-chart or light-to-chart, and it cannot be
measured from the outside.

**On the test anchors.** The anchors in `src/lib/ott.test.ts` (150" ≈ 80 lb,
207" ≈ 208 lb, 250" ≈ 365 lb, 350" ≈ 1000 lb) came from a *secondary* source,
not the GPC chart itself. They agree with the formula to within 2%, which is
why they are asserted at that tolerance. If estimates ever show a **systematic**
gap against real weigh-off results, question the anchors before touching the
formula — a wrong anchor set would have been reproduced by the tests, not
caught by them. Re-derive from the primary GPC chart before changing anything.

## Decision log

- Leaderboard ranks on **measured OTT**, not projected weight — projection error
  invites gaming.
- Weight is **always recomputed server-side on insert**; never trust a
  client-supplied weight.
- Plausibility flags are **informational only** — never blocking, and never
  accusatory in wording.
- `/diagnose` **must not recommend pesticide products or rates**. Label-legal
  recommendations are crop-specific and, in California, require a permit and a
  written PCA recommendation.
- The personal measurement log stays in **localStorage**; only leaderboard
  entries go to Supabase.
- Reading the leaderboard needs nothing; **entering it needs the patch
  passcode** (`LEADERBOARD_PASSCODE`), exchanged once for a signed httpOnly
  cookie.
- The passcode also **keys the cookie signature**, so changing it invalidates
  every outstanding session. That is intended.
- The **rate-limit counter lives inside the signed cookie**, not server memory —
  on Vercel each request can hit a different instance, so an in-process counter
  would reset unpredictably. Clearing cookies resets the count, but also
  discards the session, so the passcode has to be entered again.
- RLS gives anon **SELECT only**. There is deliberately no INSERT policy: writes
  go through `/api/leaderboard/entries` on the service role key.
- **Enabling RLS is not enough on its own.** Supabase's default privileges grant
  anon the full set on new tables in `public`, including TRUNCATE — and TRUNCATE
  is not subject to RLS. Migration 0002 revokes them. **Every new table needs the
  same `revoke all` + `grant select`**, and it must be verified by assuming the
  anon role and attempting each operation, not by reading the policy.
- The board reads the **`leaderboard_current` view**, which is `DISTINCT ON
  (grower_name, pumpkin_name)` — PostgREST cannot express that, and it keeps a
  grower who logs weekly from filling the board. It is `security_invoker`, so
  the RLS policy on `entries` still applies.

## Leaderboard layout

```
supabase/migrations/     paste into the Supabase SQL editor; no local CLI
  0001_leaderboard.sql   npm run migration:print
src/lib/leaderboard/
  validation.ts          pure; server-side input rules, HTML stripping
  session.ts             passcode compare, cookie signing, rate limit
  entries.ts             insert (service role) + board read (anon, RLS)
src/app/api/leaderboard/
  auth/route.ts          GET = am I authed?  POST = exchange passcode
  entries/route.ts       POST = validate, recompute weight, insert
src/components/
  EnterLeaderboard.tsx   submit dialog, prefilled from the local log
```

## Build discipline

Run before every push:

```bash
npm test && npm run build
```

Both must pass. Tests are Vitest (`src/**/*.test.ts`); the build type-checks the
whole project.

## Layout

```
src/
  app/
    page.tsx                  calculator (client component)
    layout.tsx                masthead, nav, footer
    globals.css               Tailwind v4 theme tokens
    leaderboard/page.tsx      placeholder
    diagnose/page.tsx         placeholder
    api/                      route handlers (empty for now)
  lib/
    ott.ts                    weight formula + growth math, all pure
    ott.test.ts               unit tests
    supabase/
      client.ts               browser client, anon key, RLS applies
      server.ts               service role + cookie-bound clients
```

`src/lib/supabase/server.ts` imports `server-only`, so importing the
service-role client from a client component fails the build rather than
shipping the key. Keep it that way.
