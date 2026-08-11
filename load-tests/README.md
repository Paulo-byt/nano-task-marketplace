# Workstream C — Load Testing (k6)

**Status:** implemented, safe read-only scope. **No production deployment is involved anywhere in this document or this directory.** The only target these scenarios ever talk to is a local `next dev` server on your own machine — every scenario defaults to `http://localhost:3000`, and none of this has been run against, or written with knowledge of, any deployed environment. See [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) for the (also not-yet-executed) deployment plan; this directory is unrelated to it.

## What this tests

Four k6 scenarios against the real, running local app:

| Scenario | Targets | Auth required | Rate limit exercised |
|---|---|---|---|
| `unauthenticated-nonce.js` | `POST /api/auth/nonce` | none | `authNonce` — 10 / 5 min, keyed by IP |
| `rate-limit-boundary.js` | `POST /api/auth/nonce` | none | same, deliberately driven past its limit |
| `authenticated-reads.js` | 6 authenticated GET APIs (below) | real session cookie | `authenticatedRead` — 120 / min, keyed **per session** |
| `marketplace-browse.js` *(optional)* | `GET /marketplace` (the real page) | none | none — this route applies no rate limit |

The six authenticated GET endpoints `authenticated-reads.js` exercises: `/api/tasks/posted`, `/api/applications`, `/api/notifications`, `/api/dashboard`, `/api/earnings`, `/api/profile`. All six were re-read directly from source before writing this scenario (not assumed) — each is a plain `GET()` with no params, requires a `session_id` cookie, and rate-limits as `` `read:${sessionUser.id}` `` against `RATE_LIMITS.authenticatedRead` in `lib/rateLimit.ts`.

There is deliberately no `GET /api/tasks` scenario — that endpoint doesn't exist (`app/api/tasks/route.ts` is `POST`-only, for task creation). The real marketplace listing is a Server Component (`app/marketplace/page.tsx`, `export const dynamic = "force-dynamic"`) that calls `getTasks()` directly against the database on every request; `marketplace-browse.js` hits that real page, not an invented API.

## What's explicitly out of scope, and why

Nothing here ever touches `/api/tasks` `POST`, `/api/applications` `POST`, funding, payout, approve, reject, AI task generation, AI evaluation, fraud analysis, or any Circle transaction-execution path — and nothing here spends testnet USDC or incurs an Anthropic API call. Not because those paths don't matter, but because load-testing them is a different, deliberately separate decision:

- **Funding / payout / Circle transaction execution** (`lib/arc/payoutRelay.ts`, `lib/circle/*`) move real testnet USDC via either a raw private key or Circle's signing infrastructure. Repeated automated calls would burn testnet funds and allowances — not free, not instantly reversible.
- **AI generation / evaluation / fraud analysis** (`lib/ai/*`) call Anthropic's API. Repeated automated calls cost real API credits.
- **Circle transaction execution** additionally risks exhausting Circle's sandbox rate limits, which are shared infrastructure, not something this workstream owns.

None of that is a "maybe later, quietly" — it would need its own explicit scoping decision, the same way this workstream itself was scoped before being built.

## Why `POST /api/auth/verify` is excluded from automatic testing

`verify`'s job is to check a **real SIWE signature** against the request's own real `Host`/origin and Arc's chain ID (`app/api/auth/verify/route.ts`, `lib/auth/siwe.ts`) — there's no way to load-test that meaningfully without a real signature from a real key, and fabricating one would defeat the point of the exact check being tested.

`scripts/load-test-provision-sessions.ts` *does* call `verify` — deliberately, once per provisioned session, using a real signature from a freshly generated local key. That's provisioning a small, fixed number of real sessions, not load-testing verify's throughput. Automated high-volume testing of `verify` itself is a separate, not-yet-made decision.

## Session requirements — read this before running `authenticated-reads.js`

All six authenticated GET routes rate-limit as `` `read:${sessionUser.id}` `` — **per session, not per IP.** That means:

- One VU reusing one session proves that *one* user's read path and rate-limit bucket behave correctly. It does **not** demonstrate independent concurrent users — every VU sharing that one session would collide on the exact same rate-limit key, which would just be testing the limiter against itself, not real concurrency.
- Real concurrent-user testing needs multiple **real, distinct sessions** — i.e., multiple genuine sign-ins, each producing its own `sessionUser.id`.
- This directory never fabricates a session cookie or mocks a successful sign-in. The only way to get a real session is to actually complete the app's real SIWE flow: `POST /api/auth/nonce` → sign the returned nonce with a real key → `POST /api/auth/verify`.

`scripts/load-test-provision-sessions.ts` does exactly that, using freshly generated, local, ephemeral private keys (via viem) — never a funded wallet, never anything that touches the blockchain (SIWE sign-in is an off-chain signature, not a transaction). It's genuinely necessary here: without it, `authenticated-reads.js` would have no legitimate way to obtain even one real session, let alone several.

```bash
npx tsx scripts/load-test-provision-sessions.ts
```

Requires the local dev server already running (see below). Defaults to 3 sessions; override with `SESSION_COUNT` (clamped to [1, 20]):

```bash
# bash
SESSION_COUNT=5 npx tsx scripts/load-test-provision-sessions.ts
```

```powershell
# PowerShell
$env:SESSION_COUNT=5; npx tsx scripts/load-test-provision-sessions.ts
```

The script targets `http://localhost:3000` by default too, via its own `LOAD_TEST_BASE_URL` — intentionally a different name from the k6 scenarios' `BASE_URL`, since this is a separate Node.js script (not a k6 script) and doesn't share k6's `__ENV` mechanism. It refuses to run against anything other than `localhost`/`127.0.0.1` unless you explicitly set `LOAD_TEST_ALLOW_REMOTE=1`: since this script performs a real sign-in, that guard exists so a typo'd URL can't accidentally provision sessions somewhere unintended.

```bash
# bash
LOAD_TEST_BASE_URL=http://localhost:3000 SESSION_COUNT=5 npx tsx scripts/load-test-provision-sessions.ts
```

```powershell
# PowerShell
$env:LOAD_TEST_BASE_URL='http://localhost:3000'; $env:SESSION_COUNT=5; npx tsx scripts/load-test-provision-sessions.ts
```

This writes `load-tests/k6/lib/sessions.local.json` (gitignored — never commit it; even though these are fund-less, ephemeral test wallets, the file contains real, currently-active session cookies with genuine read access). `authenticated-reads.js` reads this file and warns at run time if it's empty or has only one session, so you always know exactly what a given run actually proved.

## How k6 is installed / verified

k6 is a system executable on this machine already — not an npm package, and this workstream installs none. Verify it's available:

```
k6 version
```

Expected: `k6.exe v2.2.0` (or later). If this fails, that's outside this directory's scope — k6 itself needs attention first.

## How to start the app

```
npm run dev
```

Then confirm it's actually up before running anything below:

```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

A real HTTP status (e.g. `200`) means it's up; `000` / connection refused means it isn't. Nothing in this directory starts or stops the dev server for you — start and stop it yourself.

## Overriding the base URL

Every scenario defaults to `http://localhost:3000` (`load-tests/k6/lib/config.js`). Override per run:

```
k6 run --env BASE_URL=http://localhost:3000 load-tests/k6/scenarios/unauthenticated-nonce.js
```

Never point this at a deployed/production URL — no production deployment exists for this project today (see `docs/DEPLOYMENT.md`), and every scenario here was written and reasoned about only against local dev server behavior.

The provisioning script (`scripts/load-test-provision-sessions.ts`) is a separate Node.js tool, not a k6 script, so it does not read `BASE_URL` — see its own `LOAD_TEST_BASE_URL`/`LOAD_TEST_ALLOW_REMOTE` variables documented above under "Session requirements".

## Commands

**1. Syntax/validation first — no traffic, no server required:**

```
k6 inspect load-tests/k6/scenarios/unauthenticated-nonce.js
k6 inspect load-tests/k6/scenarios/rate-limit-boundary.js
k6 inspect load-tests/k6/scenarios/authenticated-reads.js
k6 inspect load-tests/k6/scenarios/marketplace-browse.js
```

Each should print the resolved `options` as JSON with no error — confirming the script parses and loads correctly before it ever touches the network.

**2. The safest scenario first, against a running local server:**

```
k6 run load-tests/k6/scenarios/unauthenticated-nonce.js
```

Default profile: 1 VU, 3 iterations. Proves nonce issuance works at all.

**3. The rate-limit boundary** (still tiny — 12 requests total, one VU):

```
k6 run load-tests/k6/scenarios/rate-limit-boundary.js
```

**4. Authenticated reads** (requires provisioned sessions first — see above):

```
npx tsx scripts/load-test-provision-sessions.ts
k6 run load-tests/k6/scenarios/authenticated-reads.js
```

**5. Optional marketplace page check:**

```
k6 run load-tests/k6/scenarios/marketplace-browse.js
```

**Heavier, opt-in profiles** (`unauthenticated-nonce.js` and `marketplace-browse.js` only) exist behind an explicit flag and are never run automatically by anyone implementing this workstream:

```
k6 run --env LOAD=1 load-tests/k6/scenarios/unauthenticated-nonce.js
```

This is still a short, light profile (a handful of VUs, 20–30 seconds) — not a real sustained load test. Treat even this as something you run deliberately, not by default.

## What each scenario proves

- **`unauthenticated-nonce.js`** — `/api/auth/nonce` issues a nonce correctly under light, safe traffic.
- **`rate-limit-boundary.js`** — the 10th request within the window succeeds, the 11th and 12th return `429` with a `Retry-After` header present, and the server keeps responding cleanly (no 5xx, no hang) once over the limit — i.e., the limiter fails closed, not broken.
- **`authenticated-reads.js`** — each of the six authenticated GET routes returns real data (`200`, never `401`) for a genuinely signed-in session, and stays healthy under however many real concurrent sessions were actually provisioned. See "Session requirements" above for what a given run does and doesn't prove.
- **`marketplace-browse.js`** *(optional)* — the actual page real users land on stays responsive under light load.

## Expected 429 behavior (boundary test)

`RATE_LIMITS.authNonce` in `lib/rateLimit.ts` is `{ limit: 10, windowMs: 5 * 60 * 1000 }`. `rate-limit-boundary.js` sends exactly 12 sequential requests from a single simulated caller (a synthetic per-run `X-Forwarded-For`, isolated from any other local traffic — see `randomPrivateIp()` in `load-tests/k6/lib/config.js` for why that's necessary):

- Requests 1–10 → `200`.
- Requests 11–12 → `429`, each with a numeric `Retry-After` header.
- The test explicitly fails if the boundary lands anywhere other than exactly the 11th request.

If you run this scenario twice within the same 5-minute window, the **second** run will 429 starting from its own request 1 — each run picks a fresh random synthetic IP, so this is about the fixed rate-limit window not having reset yet, not about IP reuse. That's expected, correct behavior, not a bug: wait 5 minutes between runs, or treat an immediate second run as "still correctly rate-limited."

## Safe vs. fund-spending

Everything in this directory is safe to run repeatedly against your local dev server: no blockchain transaction, no Circle API call, no Anthropic API call, no testnet USDC movement, anywhere in any of these four scenarios or the provisioning script. The only side effect is ordinary local Postgres dev-database writes (new `users`/`sessions` rows from nonce and sign-in calls) — the same writes real usage would produce, nothing test-specific or destructive, and consistent with `docs/DEPLOYMENT.md`'s own note that the dev database already accumulates exactly this kind of test data.
