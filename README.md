# Giant Pumpkin OTT Calculator

Estimate giant pumpkin weight from three tape measurements using the
over-the-top (OTT) method and the 2025 GPC Atlantic Giant chart, track growth
week over week, and compare against a season leaderboard.

Next.js (App Router) · TypeScript · Tailwind CSS v4 · Supabase · deployed on
Vercel.

## What's here

| Route          | State       | Notes                                                     |
| -------------- | ----------- | --------------------------------------------------------- |
| `/`            | Working     | Calculator, multi-fruit patch, dated log, lb/day growth   |
| `/leaderboard` | Working     | Ranked by measured OTT; one row per pumpkin               |
| `/diagnose`    | Working     | Photograph a sick plant, get likely causes and what to check |
| `/api/leaderboard/auth`    | Working | Exchange the patch passcode for a session cookie   |
| `/api/leaderboard/entries` | Working | Validated, passcode-gated insert                   |
| `/api/diagnose`            | Working | Reads a photo with Claude; IP rate limited         |

The calculator's measurement log is **local to the browser**
(`localStorage`, key `agoptics-ott-v1`). It is not synced and not sent
anywhere. Supabase backs the leaderboard only — entries reach the server when
someone deliberately submits one.

## Layout

```
src/
  app/
    page.tsx                  calculator (client component)
    layout.tsx                masthead, nav, footer
    globals.css               Tailwind v4 theme tokens
    leaderboard/page.tsx      the board
    diagnose/page.tsx         plant help
    api/                      route handlers
  lib/
    ott.ts                    weight formula + growth math, all pure
    ott.test.ts               unit tests, anchored to the published chart
    diagnose/
      prompt.ts               system prompt + tool schema (server only)
      types.ts                the response shape and the grower-facing copy
      image.ts                media-type sniffing and the size cap
      rate-limit.ts           IP extraction, hashing, window logic (pure)
      requests.ts             the ledger read/write, service role
    supabase/
      client.ts               browser client, anon key, RLS applies
      server.ts               server clients incl. service role
```

## The formula

`ottWeight(ott)` in `src/lib/ott.ts` is the 2025 GPC Atlantic Giant chart
formula. `ott` is the sum of all three measurements in inches:

```
a      = (12.81 / (1 + 6.87 * 2^(-ott/97)))^3
b      = (ott / 45.9)^3.014
weight = max(0, a + b - 10)
```

Tested against published chart anchors — 150" ≈ 80 lb, 207" ≈ 208 lb,
250" ≈ 365 lb, 350" ≈ 1000 lb — to within 2%. The estimate itself carries the
usual ±5% and assumes Atlantic Giant genetics; wall thickness is what drives
heavy-to-chart or light-to-chart and cannot be measured from the outside.

## Local setup

Requires Node 20 or newer (Node 22 recommended).

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase values
npm run dev                        # http://localhost:3000
```

The calculator page runs fine with empty Supabase values — it touches nothing
but `localStorage`. The Supabase clients throw a named error the first time
they are constructed without credentials, so leaderboard work needs a real
`.env.local`.

### Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → Data API** for the project URL.
3. **Project Settings → API Keys** for the publishable (`sb_publishable_…`) and
   secret (`sb_secret_…`) keys. These replace the legacy JWT `anon` and
   `service_role` keys; the env var names still say `ANON_KEY` and
   `SERVICE_ROLE_KEY` because they name the role, not the key format.
4. Paste all three into `.env.local`, plus a `LEADERBOARD_PASSCODE`.
5. Apply the schema — see below.

### Applying the schema

There is no local Supabase CLI in this project; everything is cloud. Print the
migration and paste it into the dashboard:

```bash
npm run migration:print
```

Then **SQL Editor → New query → paste → Run**. `supabase/migrations/` holds
them in order — `0001` creates the `entries` table, its indexes, RLS with a
select-only policy for anon, and the `leaderboard_current` view; later ones
tighten grants, add ownership and soft delete, and add the `/diagnose` rate
limit ledger. Run them in filename order on a fresh project.

Row Level Security is what protects the data, but it is not the whole of it.
Supabase grants anon the full privilege set on new tables in `public`, and
`TRUNCATE` is not subject to RLS — so every table also needs an explicit
`revoke all`, and it needs verifying by assuming the anon role and attempting
each operation rather than by reading the policy. Anon reads the board through
views and has no rights on `entries` or `diagnose_requests` at all; writes go
through route handlers on the secret key.

### Commands

```bash
npm run dev         # dev server
npm run build       # production build
npm start           # serve the production build
npm test            # unit tests (vitest)
npm run test:watch  # unit tests in watch mode
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
```

## Deploying to Vercel

Import the repository at [vercel.com/new](https://vercel.com/new). The Next.js
preset needs no build configuration.

Set these under **Project Settings → Environment Variables**, for Production,
Preview, and Development:

| Variable                        | Scope       | Value                                                    |
| ------------------------------- | ----------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Public      | `https://<project-ref>.supabase.co`                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public      | Supabase `anon` key                                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | **Secret**  | Supabase `service_role` key — bypasses RLS                |
| `LEADERBOARD_PASSCODE`          | **Secret**  | `openssl rand -base64 32`                                 |
| `ADMIN_PASSCODE`                | **Secret**  | Removing any entry; that route 503s without it            |
| `ANTHROPIC_API_KEY`             | **Secret**  | Read by `/api/diagnose`; without it that page says so     |
| `NEXT_PUBLIC_SITE_URL`          | Public      | Optional; layout.tsx already defaults to the live domain  |

Anything prefixed `NEXT_PUBLIC_` is compiled into the browser bundle and is
readable by anyone who loads the site. The two secrets must never carry that
prefix. `src/lib/supabase/server.ts` imports `server-only`, so importing the
service-role client from a client component fails the build rather than
shipping the key.

Environment variables are read at build time. After changing one in Vercel,
redeploy for it to take effect.
