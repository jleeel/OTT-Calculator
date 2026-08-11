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

- `edit_token` must **never** be anon-readable — it is the only proof of
  ownership for deletion. anon has no SELECT on `entries` at all; it reads the
  `leaderboard_current` and `entry_history` views, which list columns
  explicitly and filter `deleted_at is null`.
- Those two views are **security definer, not `security_invoker`** (migration
  0004). Invoker semantics require the caller to hold rights on `entries`,
  which anon deliberately does not. The view definition is the boundary now — if
  a restrictive per-row policy is ever added to `entries`, revisit them or they
  will read past it.
- Deletion is **soft** (`deleted_at`); rows are retained for audit.
- Plausibility flags are computed on insert and stored in `flags[]`. They never
  block. The real integrity mechanism is the **public measurement history**,
  one tap from each board row.
- **One rule does block, and it is not a flag.** Above `MAX_LB_PER_DAY` (70)
  the insert is refused with a 400. That is a different claim from the flags:
  not "unusual" but "not physically possible" — the best fruit ever grown put
  on roughly 50–60 lb on their best day, so 70 is past the record rather than a
  judgement about a grower. Between the `jump` flag (40) and this, an entry is
  marked but still accepted. The refusal names the mistyped date as the likely
  cause and never accuses; a refused entry does not burn a rate-limit slot,
  because the session cookie is only written on success. The rate is checked
  against **both neighbours in time** — the entry before and the entry after —
  because a back-dated insert lands between existing rows, and a
  backwards-only check let it imply impossible growth against the later row
  already on the board.

- `/diagnose` is rate limited **by IP, in Postgres**, not by cookie. A cookie
  limit is a courtesy and clearing it resets the count; every call here costs
  money. The ledger (`diagnose_requests`) stores an **HMAC of the address**, not
  the address, keyed by the service role key — rotating that key resets the
  counters instead of exposing anything. anon has **no privileges on that table
  at all** and no policy.
- The slot is claimed **before** the model call, not after. A request that
  reaches Anthropic and then times out has still cost money. If the limiter
  itself is down the route **refuses** — falling open is someone else's bill.
- The claim is **atomic in Postgres** (migration 0006): an RPC counts and
  inserts under a per-address advisory lock, so a parallel burst cannot all
  pass the count before any insert lands. While the migration is unapplied the
  code falls back to the old two-step claim and logs a warning — apply 0006 to
  close that. The limiter's identity is `x-real-ip`, else the **right-most**
  `x-forwarded-for` hop; the left-most is client-chosen and would hand out a
  fresh identity per request.
- The system prompt and tool schema live in `src/lib/diagnose/prompt.ts`; the
  response type and grower-facing copy live in `types.ts`. That split is load
  bearing: the client imports `types.ts`, so keeping the prompt out of it keeps
  the prompt out of the browser bundle. Verified by grepping `.next/static`
  after a build, not assumed from tree shaking.
- The model is **`claude-sonnet-5`**. Two things about it shape the request:
  adaptive thinking is **on by default** and `max_tokens` caps thinking *and*
  the answer together, so `max_tokens` is 8000 rather than the few hundred the
  tool call needs — a tight budget shows up as `stop_reason: "max_tokens"` and
  no diagnosis. It is also the first Sonnet with **high-resolution vision**
  (2576px long edge, up from 1568), which is why the browser downscales to
  2576: mite stippling and mildew texture are exactly the detail a smaller
  image throws away.
- The model answers through a **forced single tool call**, not
  `output_config.format`. Structured outputs *are* available on this model and
  would do the same job; the tool call is kept because it works on every model,
  so changing the model cannot silently break the response shape. Forcing tool
  choice alongside thinking is fine on the Claude API — only **Bedrock**
  requires `thinking: {type: "disabled"}` for that.
- The pesticide rule is enforced by **tests over the prompt text**
  (`prompt.test.ts`), including one asserting the prompt does not itself name a
  product. A prompt listing products as examples of what not to say has put
  product names in front of the model.

- `/diagnose` answers **two questions**, picked by a control at the top of the
  page: *what is wrong with my plant* (a photo of the symptom) and *what is this
  bug* (a photo of the animal). Same route, same image handling, same limiter,
  same key — a different prompt, tool and card. Two routes would have meant two
  rate limiters, and the limiter is the part that must not be got wrong twice.
  The mode arrives as a form field; anything unrecognised is the plant question.
- The two answers come back under **different keys** (`diagnosis` /
  `identification`). A client that asked one question can then never render the
  other one's answer — a card of empty fields is worse than a plain error.
- The **pesticide rule is one constant** (`PESTICIDE_RULE`) interpolated into
  both prompts, with a test asserting it reaches both. Two prompts each carrying
  their own copy is one edit away from only one of them being right, and the one
  that drifts is the one nobody is looking at.
- Knocking bugs into a jar of soapy water is **collection, not spraying**, and
  the identification prompt is allowed to suggest it. Putting anything on the
  plant, soap included, is an application and is still refused.
- Every identification candidate carries **its own `role`** — pest, beneficial
  or neutral — not just the leading one. The alternate is often the whole point:
  a squash bug nymph and an assassin bug nymph in the same photo are a pest and
  a predator, and a grower shown only the leading role would act on the wrong
  one. `beneficial` covers predators, parasitoids and pollinators.
- An unreadable role degrades to **`unknown`, never to `neutral`**. "Neutral" is
  a claim — it tells a grower the thing is harmless. A value that could not be
  parsed has to claim nothing.
- The identification prompt spends most of its length on **beneficials and
  look-alikes**, not on pests. The pests are what growers already know; the
  lady beetle larva, the hover fly larva and the leaf of aphid mummies are what
  they kill by mistake. Lady beetle eggs destroyed as squash bug eggs is the
  single most expensive mix-up in a patch, so both egg descriptions and the
  three tells that separate them (colour, angle, spacing) are asserted by test.

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

## Diagnose layout

```
supabase/migrations/
  0005_diagnose_rate_limit.sql   the ledger; anon gets nothing
src/lib/diagnose/
  prompt.ts              both system prompts + both tool schemas — SERVER ONLY
  types.ts               response shapes, copy, all four normalisers — client safe
  image.ts               pure; magic-byte sniffing, size cap, note cleaning
  rate-limit.ts          pure; IP extraction, HMAC, sliding window
  requests.ts            the ledger read/write on the service role key
src/app/api/diagnose/route.ts   the only place ANTHROPIC_API_KEY is read
src/components/DiagnoseForm.tsx downscales in-browser, posts, renders
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
