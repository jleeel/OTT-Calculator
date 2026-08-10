# Giant Pumpkin OTT Calculator — project context

Over-the-top (OTT) weight calculator, growth log, and season leaderboard for
giant pumpkin growers.

## Stack and deploy target

Next.js (App Router) · TypeScript · Tailwind CSS v4 · Supabase · Vercel.

This deploys as **its own Vercel project on its own subdomain**. It is separate
from well-registration — separate project, separate domain, separate Supabase
tables. Do not fold this into that codebase or share its deployment config.

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
