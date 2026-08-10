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
| `/leaderboard` | Placeholder | Will read submitted entries from Supabase                 |
| `/diagnose`    | Placeholder | Will read a fruit's history for heavy/light-to-chart trends |
| `/api/*`       | Empty       | Route handlers land here                                  |

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
    leaderboard/page.tsx      placeholder
    diagnose/page.tsx         placeholder
    api/                      route handlers (empty for now)
  lib/
    ott.ts                    weight formula + growth math, all pure
    ott.test.ts               unit tests, anchored to the published chart
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
3. **Project Settings → API Keys** for the `anon` and `service_role` keys.
4. Paste all three into `.env.local`.

Row Level Security is what protects the data from the anon key. Enable it on
every table the browser can reach, and write the policies before the first
public deploy.

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
| `ADMIN_PASSCODE`                | **Secret**  | Admin actions; unused until a later pass                  |
| `ANTHROPIC_API_KEY`             | **Secret**  | Reserved for `/diagnose`; unused until a later pass       |
| `NEXT_PUBLIC_SITE_URL`          | Public      | Your production URL, e.g. `https://ott.example.com`       |

Anything prefixed `NEXT_PUBLIC_` is compiled into the browser bundle and is
readable by anyone who loads the site. The two secrets must never carry that
prefix. `src/lib/supabase/server.ts` imports `server-only`, so importing the
service-role client from a client component fails the build rather than
shipping the key.

Environment variables are read at build time. After changing one in Vercel,
redeploy for it to take effect.
