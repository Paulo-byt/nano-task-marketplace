# Deployment & Operations Guide

**Status: planning documentation only.** Nothing in this document has been executed. No Vercel project exists, no production credentials exist, and no production database exists. See [Section 17](#17-production-cutover-gate) before treating anything here as authorization to act.

This guide describes the current repository accurately as of Phase 10 Workstream A (commit `0c22b41` plus the uncommitted Workstream A Circle-custody changes) — it does not describe aspirational infrastructure that hasn't been built.

---

## 1. Architecture

- **Next.js 16 (App Router)** — both the UI and the API live in one deployable: pages render under `app/`, and server logic lives in `app/api/*/route.ts` Route Handlers. There is no separate backend service.
- **Hosting target: Vercel.** No alternative has been evaluated or is needed — this is a standard Next.js App Router project with no custom server, matching Vercel's native deployment model exactly. `next.config.ts` currently has no custom configuration (build output, rewrites, headers, etc.) beyond the framework defaults.
- **Neon (serverless Postgres) + Drizzle ORM.** `db/index.ts` connects via `drizzle-orm/neon-serverless` and `@neondatabase/serverless`'s `Pool`, reading a single `DATABASE_URL`. Five migrations exist today (`0000`–`0004`), all purely additive (no destructive `ALTER`/`DROP` has ever been written).
- **Arc blockchain (EVM-compatible, testnet only today).** `lib/arc/chains.ts` defines a hardcoded `arcTestnet` chain config (chain id `5042002`). All on-chain reads go through `lib/arc/publicClient.ts`; funding verification and payout submission live in `lib/arc/verifyApproval.ts`, `lib/arc/verifyPayout.ts`, and `lib/arc/payoutRelay.ts`.
- **Circle custody integration (Workstream A, testnet only).** `lib/circle/` adds a second payout-custody path alongside the pre-existing raw-key executor, selected via `PAYOUT_CUSTODY_MODE`. Both paths currently target Arc **Testnet** only — see [Section 7](#7-circle-custody-deployment).
- **Anthropic (Claude) AI integration.** `lib/ai/` powers assisted task drafting, submission evaluation, and fraud-risk analysis — each advisory-only, gated behind rate limits (`lib/rateLimit.ts`).
- **Server-side API routes** handle every authenticated action (auth, tasks, applications, payouts, AI calls) and are the only place secrets are ever read.
- **Client-side wallet connection** (`providers/WagmiProvider.tsx`, `providers/CircleProvider.tsx`) handles wallet connect/sign-in in the browser using only public configuration — no secret ever reaches this layer.

### Secrets vs. public configuration

| Category | Examples | Where it may run |
|---|---|---|
| Server-only secrets | `ANTHROPIC_API_KEY`, `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `DATABASE_URL`, `ARC_EXECUTOR_PRIVATE_KEY` | Route Handlers and server-only `lib/` modules only. Every module holding one of these has a hard `typeof window !== "undefined"` guard that throws if it's ever evaluated in a browser. |
| Server-only, non-secret config | `PAYOUT_CUSTODY_MODE`, `CIRCLE_EXECUTOR_WALLET_ID` | Same as above — not secret in the cryptographic sense, but still never exposed client-side, since they describe internal routing/config, not something a client needs. |
| Public configuration | `NEXT_PUBLIC_ARC_RPC_URL`, `NEXT_PUBLIC_ARC_NETWORK` | Inlined into the client bundle by Next.js at build time. Must never hold anything secret — enforced by convention (the `NEXT_PUBLIC_` prefix), not by code. |

---

## 2. Deployment prerequisites

Accounts/services that would **eventually** be required for a real deployment — none are being created now:

- A GitHub repository (this one) connected to Vercel.
- A Vercel account/project.
- A Neon project with separate database branches per environment (see [Section 5](#5-neon-database-strategy)).
- A Circle account, with sandbox/testnet access already partially configured (`CIRCLE_API_KEY` has a value in local `.env.local`; `CIRCLE_ENTITY_SECRET` and `CIRCLE_EXECUTOR_WALLET_ID` do not — see Workstream A's report) and **no production access at all**.
- Continued use of Arc Testnet's existing public RPC; no Arc mainnet account or configuration exists or is being requested.
- An Anthropic account with API access (credits currently unavailable per Phase 8/9 testing — a real, pre-existing account-level limitation, not a deployment blocker).

Production onboarding for any of the above (a live Circle account, an Arc mainnet presence, production Anthropic billing) is explicitly a **future, separately authorized step** — see [Section 17](#17-production-cutover-gate).

---

## 3. Environment variables

Verified against the actual current codebase (not an old plan) — grepped for every real consumption site before including anything here.

| Variable | Required? | Server-only / Public | Purpose | Preview (recommended) | Production (recommended) |
|---|---|---|---|---|---|
| `DATABASE_URL` | **Required** — `db/index.ts` throws immediately if unset | Server-only | Neon Postgres connection string | A Preview/staging Neon branch, never the dev database | A dedicated Production Neon branch |
| `ARC_EXECUTOR_PRIVATE_KEY` | Required **only when** `PAYOUT_CUSTODY_MODE` is unset or `"raw-key"` (today's default) | Server-only | Derives the raw-key payout executor account (`lib/arc/executor.ts`) | Same testnet key as development, or a separate testnet-only key | Not applicable — this path is explicitly testnet-only; see Section 7 |
| `PAYOUT_CUSTODY_MODE` | Optional | Server-only | Selects `"raw-key"` (default) or `"circle"` custody (`lib/arc/payoutRelay.ts`) | Either, but must stay testnet-scoped either way | Undecided — no production path exists yet for either mode |
| `CIRCLE_API_KEY` | Required **only when** `PAYOUT_CUSTODY_MODE="circle"` | Server-only | Circle Developer-Controlled Wallets API key | A Circle **sandbox/test** key only | Not applicable — no production Circle account is authorized |
| `CIRCLE_ENTITY_SECRET` | Required **only when** `PAYOUT_CUSTODY_MODE="circle"` | Server-only | Circle's entity-level authorization secret | Sandbox-scoped only | Not applicable |
| `CIRCLE_EXECUTOR_WALLET_ID` | Required **only when** `PAYOUT_CUSTODY_MODE="circle"` | Server-only | The provisioned Circle wallet's id (`lib/circle/executorWallet.ts`) — never created at runtime, see `scripts/circle-provision-testnet-wallet.ts` | An ARC-TESTNET wallet id only | Not applicable |
| `ANTHROPIC_API_KEY` | Required **only for AI routes** (`lib/ai/client.ts` throws if unset, but only when an AI route is actually invoked) | Server-only | Claude API access for task drafting/evaluation/fraud analysis | Same key as development is acceptable | A real Anthropic account with billing enabled |
| `NEXT_PUBLIC_ARC_RPC_URL` | Optional — falls back to a hardcoded default (`https://rpc.testnet.arc.io`) if unset | Public (client-exposed) | Arc RPC endpoint for viem/wagmi | Leave unset (use the default) or set explicitly | Same, once/if a mainnet RPC is ever introduced (not today) |
| `NEXT_PUBLIC_ARC_NETWORK` | Optional | Public (client-exposed) | **Accuracy note**: declared and documented (README, `CLAUDE.md`) as a network label, but grepping the actual codebase confirms no code currently reads `process.env.NEXT_PUBLIC_ARC_NETWORK` to branch behavior. Today's testnet-only behavior comes from `lib/arc/chains.ts`'s hardcoded chain config and the hardcoded `"ARC-TESTNET"` constant in `lib/circle/client.ts`, not from this variable. Kept here because it's part of the documented contract, not because it's currently load-bearing. | `testnet` | `testnet` — **must not be changed** for this repository; see the constraint below |

**`CIRCLE_ALLOW_PRODUCTION` is deliberately not listed above.** It was discussed during Phase 10 planning as a possible future production-enable flag but was never implemented — Workstream A's implementation deliberately contains no environment variable or code path capable of selecting Arc mainnet or a Circle production account. Confirmed by grep: it does not appear anywhere in the source tree. Do not treat it as configurable until it's actually built as part of a future, separately authorized production workstream.

**`NEXT_PUBLIC_ARC_NETWORK` must remain `testnet`** for every environment this repository is deployed to until a separately authorized production workstream changes that — this document does not authorize changing it.

No actual secret values appear anywhere in this document.

---

## 4. Vercel configuration

(Documentation only — no Vercel project has been created.)

- **Import**: connect this GitHub repository to a new Vercel project via Vercel's own "Import Git Repository" flow.
- **Framework detection**: Vercel auto-detects Next.js from `package.json`'s `next` dependency and `next build`/`next start` scripts — no manual framework selection needed.
- **Build command**: `next build` (from `package.json`'s `"build"` script) — the default Vercel would detect; no override needed.
- **Install command**: `npm install`, matching the package manager actually in use here (`package-lock.json` is present; no `yarn.lock`/`pnpm-lock.yaml` exists) — Vercel auto-detects this from the lockfile.
- **Output configuration**: none required. `next.config.ts` has no custom `output`, `distDir`, or rewrite/redirect configuration today — the framework defaults apply.
- **`vercel.json`**: not created, and not currently needed — there is nothing about this project's build/runtime that the Next.js + Vercel defaults don't already handle correctly.
- **Environment variables**: configured per-environment (Preview vs. Production) in Vercel's project settings UI, using the table in Section 3 as the source of truth for which variables exist and what they mean.
- **Preview vs. Production environments**: Vercel's own distinction — every non-`main` branch/PR gets a Preview deployment with its own environment-variable scope; `main` (or whatever the production branch is eventually designated) gets Production scope. See Sections 5 and 10 for why these must never share credentials.

---

## 5. Neon database strategy

**Recommended model** (not yet implemented): three logically separate databases/branches —

1. **Development** — the existing local dev database, used today.
2. **Preview/staging** — a separate Neon branch, used by Vercel Preview deployments, safe to reset/reseed freely.
3. **Production** — a dedicated Neon branch, created only once a production deployment is actually authorized.

**Why Production must never share the development `DATABASE_URL`**: the dev database has accumulated extensive test fixtures across every phase of this project (test wallets, synthetic fraud-signal data, throwaway tasks) — none of it appropriate for a real, public-facing environment, and mixing them risks both data-integrity confusion and accidentally exposing test data through a production UI.

**Migration discipline** (the same discipline already used throughout Phases 7–10):
1. Review the migration SQL before applying it anywhere.
2. Confirm the target `DATABASE_URL` explicitly — never assume which environment a shell session is pointed at.
3. Apply the migration (`npm run db:migrate`) to the intended environment only.
4. Verify the resulting migration state independently (e.g., query `drizzle.__drizzle_migrations` directly, the same technique used to verify Phase 9's index migration).
5. Deploy the application code that depends on the new schema.
6. Confirm application health post-deploy (Section 13).

No migration is run as part of this workstream. No production database exists to run one against.

---

## 6. Database migration rollback policy

- **Application rollback is easier than schema rollback.** Reverting a Vercel deployment to a previous build is close to instant; undoing a schema change already applied to real data is not.
- **Do not blindly reverse a migration file.** Drizzle migrations here have all been additive (`CREATE TABLE`, `CREATE INDEX`, etc.) — there is no destructive migration to "reverse" today, and that should remain a deliberate property of this project's migration history, not an accident.
- **A destructive change requires its own forward migration**, reviewed with the same rigor as any other — not a raw revert of a prior file.
- **Backups/restore are a Neon-provider-level concern**, configured when a real production branch is actually provisioned — nothing is configured today, and this document does not claim otherwise.
- **Plan rollback before, not after, any future destructive schema change** — decide the corrective-migration strategy as part of that change's own review, not improvised afterward.

---

## 7. Circle custody deployment

### raw-key (existing, default)

`PAYOUT_CUSTODY_MODE` unset or `"raw-key"`. `ARC_EXECUTOR_PRIVATE_KEY` derives a plain viem account (`lib/arc/executor.ts`) that acts as a delegated ERC-20 spender — never a fund custodian. This has been the project's only payout mechanism since Phase 7 and remains fully functional (reconfirmed by Workstream A's regression testing). **It is explicitly a testnet/prototype mechanism, not production custody**: the signing key lives in plain server environment configuration with no revocation mechanism short of generating a new key and having every creator re-approve a new address. It should not be treated as an acceptable custody model for real funds.

### circle (Workstream A, testnet only)

`PAYOUT_CUSTODY_MODE="circle"`, requiring `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, and `CIRCLE_EXECUTOR_WALLET_ID` (a wallet provisioned once via `scripts/circle-provision-testnet-wallet.ts`, never created at request time). This path submits the same `transferFrom` call as raw-key mode, but signed by Circle's managed infrastructure instead of a locally-held key — the non-custodial funds model is unchanged, only who holds the signing authority changes.

**The current implementation hard-codes `ARC-TESTNET`** (`lib/circle/client.ts`'s `CIRCLE_BLOCKCHAIN` constant) — there is no code path, flag, or environment variable anywhere in this implementation capable of selecting Arc mainnet. Live testnet verification of this path itself remains outstanding: `CIRCLE_ENTITY_SECRET` and `CIRCLE_EXECUTOR_WALLET_ID` are not yet configured, so the Circle path has been verified structurally (build/lint/the real "missing configuration" failure path) but not yet end-to-end against a live Circle sandbox transaction.

**Production Circle onboarding (a live Circle account, mainnet wallet provisioning, a production-enable mechanism) is not part of this implementation and requires separate authorization** before any of it is built.

---

## 8. Secrets management

- `.env.local` is local-only, already correctly covered by `.gitignore`'s `.env*` pattern, and confirmed not tracked by git.
- Never commit a secret, and never use a `NEXT_PUBLIC_` prefix for one — the prefix is a Next.js build-time signal that a value gets inlined into the client bundle.
- Never print a secret in logs — `lib/log.ts`'s structured events are deliberately built to carry only IDs, durations, and safe error text (see Section 12).
- Compromised secrets should be rotated at the source (Anthropic/Circle/Neon's own console) — no rotation has occurred or is being requested here.
- **Vercel's encrypted environment variables are the intended eventual production secret store** — nothing is configured there today, since no Vercel project exists yet.

---

## 9. Deployment procedure

**When production deployment is authorized** (not now):

1. Confirm the exact approved commit to deploy.
2. Confirm production accounts (Vercel, Neon, Circle, Anthropic) actually exist and are accessible.
3. Configure Vercel Production environment variables per Section 3.
4. Configure the production Neon `DATABASE_URL` (a dedicated branch, per Section 5).
5. Confirm Circle production custody configuration (once that workstream exists — it doesn't yet).
6. Confirm Arc production configuration (does not exist yet — this repository is testnet-only).
7. Review all pending migrations.
8. Apply migrations to production.
9. Deploy.
10. Verify health (Section 13).
11. Verify authentication end-to-end.
12. Verify task creation.
13. Verify funding.
14. Verify payout.
15. Verify logs are flowing and contain no secrets.
16. Begin ongoing monitoring.

This is documentation only. None of these steps are performed as part of this workstream.

---

## 10. Preview/staging procedure

- **Preview must never use production credentials** — configure Vercel's Preview environment-variable scope separately from Production, never inheriting it.
- **Preview must not use Arc mainnet** — trivially true today, since no mainnet configuration exists anywhere in the codebase to enable.
- **Preview should use a non-production database** — the Preview/staging Neon branch from Section 5, never the eventual production branch.
- **Circle in Preview should remain testnet** — identical constraint to Production not existing yet: Preview should use `PAYOUT_CUSTODY_MODE` pointed at testnet-only credentials, exactly as local development does today.

---

## 11. Rollback procedure

### Application rollback
Vercel retains previous deployments and supports promoting any prior one back to the active deployment — fast, and the primary rollback mechanism for application-code issues.

### Database rollback
**Rolling back a Vercel deployment does not undo a database migration.** If a bad deploy shipped alongside a schema change:
1. Identify the actual current migration state (query `drizzle.__drizzle_migrations` directly — do not assume from the migration files alone).
2. Assess whether the previous application version is even compatible with the current schema state (an additive migration usually is; anything else needs explicit checking).
3. If not compatible, write a new corrective migration rather than attempting to reverse the applied one.
4. Fall back to the database provider's own backup/restore mechanism only if a corrective migration isn't sufficient — no such procedure is configured today.

---

## 12. Logging and monitoring

Builds on Phase 9's `lib/log.ts` — structured, single-line JSON written to stdout/stderr via the existing `console.log`/`console.error`, not a new logging framework.

- **Vercel captures stdout/stderr automatically** once a project is actually deployed there — no separate log shipping is required to get *basic* visibility.
- **Events already emitted today** include: rate-limit rejections (`rate_limit_exceeded`), authentication failures (`auth_verify_failed`), payout/blockchain failures (`payout_submit_failed`, `payout_receipt_failed`, and the Circle-path equivalents `circle_payout_transaction_created`, `circle_payout_hash_obtained`, `circle_payout_polling_failed`), and AI failures (`evaluate_failed`, `analyze_fraud_risk_failed`, `generate_task_failed`), each with IDs/durations/safe error text only.
- **No external log aggregator exists yet.**
- **No alerting system exists yet.**
- **No APM exists yet.**

Do not treat any of the above as already configured beyond "Vercel will show you raw stdout/stderr once deployed" — nothing routes those logs anywhere else today.

---

## 13. Health verification checklist

Post-deployment checklist (to be run once an actual deployment exists):

- [ ] Deployment succeeds
- [ ] Build succeeds
- [ ] Environment variables resolve (no "not set" errors at runtime)
- [ ] Database connection works
- [ ] Migration state matches what's expected for the deployed commit
- [ ] Authentication (SIWE sign-in) works
- [ ] Wallet connection works
- [ ] Marketplace loads
- [ ] Task creation works
- [ ] Funding works
- [ ] Applications work
- [ ] Submission works
- [ ] Evaluation gate behaves correctly (including the already-evaluated 409 guard)
- [ ] Fraud-analysis gate behaves correctly (including worker invisibility)
- [ ] Payout works
- [ ] Independent blockchain receipt verification works (never trust submission success alone)
- [ ] Rate limits work (a deliberate over-limit call returns 429)
- [ ] Logs appear or (Vercel dashboard)
- [ ] No secrets appear in logs
- [ ] No unexpected console/runtime errors

---

## 14. Security checklist

- [ ] No secrets committed to Git (confirmed today: `.env*` gitignored, never tracked)
- [ ] No secret uses a `NEXT_PUBLIC_` prefix
- [ ] Production and testnet configuration are kept separate (not applicable yet — no production exists)
- [ ] `PAYOUT_CUSTODY_MODE` is explicitly, deliberately configured per environment, not left to default silently
- [ ] Database environments are separated (dev/preview/production never share a `DATABASE_URL`)
- [ ] Session cookies remain httpOnly, `SameSite=Lax`, and `secure` in production (`process.env.NODE_ENV === "production"` already gates this in `lib/auth/session.ts`'s cookie-setting code)
- [ ] SIWE domain/URI/chain-id validation (Phase 9) remains intact
- [ ] Rate limiting (Phase 9) remains intact
- [ ] Payout authorization (session + task/application ownership) remains intact
- [ ] Independent blockchain receipt verification remains intact for both custody modes

---

## 15. Current limitations / known technical debt

- Circle's live testnet flow has not yet been verified end-to-end — `CIRCLE_ENTITY_SECRET` and `CIRCLE_EXECUTOR_WALLET_ID` are unavailable in this environment.
- The raw-key executor remains available and is still the default custody path.
- In-memory rate limiting (`lib/rateLimit.ts`) is single-process only.
- Structured logs have no aggregation or alerting.
- Executor nonce concurrency under simultaneous payouts remains a monitored, unaddressed risk.
- ERC-20 allowance-overwrite behavior (funding a later task can invalidate an earlier, unpaid task's allowance) remains existing, undocumented-until-Phase-9 technical debt.
- Circle's transaction fee level is currently hard-coded to `MEDIUM`.
- The installed Circle SDK's `generateIdempotencyKey` helper is a types-only artifact absent from the actual compiled bundle — worked around with Node's `crypto.randomUUID()`, which satisfies the same real, used `idempotencyKey` field.
- Professional legal review (Terms of Service, Privacy Policy, compliance/KYC questions) remains outstanding.
- Load testing has not yet been performed.

---

## 16. Disaster/recovery considerations

Documenting only what is actually known or already true today — nothing here describes a configured system:

- **Application rollback**: Git history + Vercel's deployment history together allow reverting application code; nothing beyond that exists today.
- **Database recovery**: conceptually Neon's own backup/point-in-time-recovery features, once a production branch is provisioned — not configured today.
- **Secret rotation**: possible at the source (Anthropic/Circle/Neon consoles) whenever needed; no rotation schedule or tooling exists.
- **Circle credential revocation/rotation**: expected to be possible via Circle's own console without abandoning a provisioned wallet's address (per Workstream A's plan) — not yet verified against a real Circle account.
- **Executor wallet/address implications**: rotating the raw-key executor's private key requires every creator to re-approve a new spender address; this is a real, disruptive operational cost worth remembering before ever rotating that key in a live environment.
- **Payout safety**: every payout, in both custody modes, is independently re-verified against Arc's own RPC before ever being marked complete — this remains true regardless of deployment environment.
- **Blockchain transaction irreversibility**: a confirmed on-chain transfer cannot be undone by any process described in this document; the only "recovery" from an incorrect payout is a new, separate transaction, and no automated mechanism for that exists.

---

## 17. Production cutover gate

> **Production deployment is NOT currently authorized.**

This document describes how a production deployment *would* work once authorized — it is not itself that authorization. The following must each be separately obtained/approved before any production deployment proceeds:

- [ ] Circle production account onboarding
- [ ] Production credentials (Circle, Anthropic, any other service) actually created
- [ ] Production Arc configuration (does not exist today — mainnet is out of scope until explicitly authorized)
- [ ] A provisioned production database
- [ ] Explicit Vercel deployment authorization
- [ ] Professional legal review (Terms of Service, Privacy Policy, compliance/KYC questions)
- [ ] A completed load-test review
- [ ] A final security review

Do not treat the existence of this document as satisfying any of the above.
