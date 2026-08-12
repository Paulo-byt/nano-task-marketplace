# Nano Task Marketplace

A global micro-task marketplace where anyone with a crypto wallet can post or complete small tasks and get paid instantly in USDC, settled on the Arc blockchain.

> **Status:** SIWE wallet authentication, the full task/application/payout lifecycle, and AI-assisted task drafting/evaluation/fraud-risk analysis are implemented. Phase 10 added testnet Circle custody, load-testing tooling, and legal-scaffolding placeholders on top of that. Arc **Testnet** only — not production-ready. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for current deployment status; [Project Status](docs/PROJECT_STATUS.md) has the detailed phase-by-phase history.

---

## Table of contents

- [Overview](#overview)
- [Motivation](#motivation)
- [Key features](#key-features)
- [Technology stack](#technology-stack)
- [System architecture overview](#system-architecture-overview)
- [Folder structure](#folder-structure)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [Database setup: Neon and Drizzle](#database-setup-neon-and-drizzle)
- [Running locally](#running-locally)
- [Available scripts](#available-scripts)
- [Current project status](#current-project-status)
- [Screenshots](#screenshots)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

## Overview

Nano Task Marketplace lets anyone post a micro-task — paying between $0.01 and $5.00 in USDC — and lets anyone with a wallet complete it and get paid, with no bank account required on either side. Tasks, applications, and payouts are tracked in a real database; a connected wallet address is the only form of identity the app currently asks for.

Claude assists with task drafting, submission evaluation, and fraud-risk analysis (`lib/ai/`) — each advisory only, with the task creator always making the final call. See [Roadmap](docs/ROADMAP.md) for how this and the rest of the product came together.

## Motivation

Traditional micro-task and gig platforms require bank accounts, national ID verification, and payment rails that exclude a large part of the world. By settling in USDC on a low-cost EVM-compatible chain and using a wallet address as the unit of identity, Nano Task Marketplace aims to let anyone, anywhere, earn from small tasks with nothing more than a crypto wallet.

## Key features

**Implemented today:**

- Wallet connection to Arc Testnet (injected wallets such as MetaMask), with network-mismatch detection and a guided switch-network prompt
- SIWE (Sign-In With Ethereum) authentication — cryptographically verified identity via a signed message and a server-side session, not just a connected address
- Marketplace browsing with live search and category filtering, backed by a real database
- Task detail pages, on-chain task funding, and a real application flow with duplicate-application prevention
- The full application lifecycle: approval, rejection, post-approval revocation (a creator can decline an already-approved application before its payout completes; a *completed* payout can never be reversed this way), and completion
- Real USDC payout execution on Arc Testnet, independently re-verified against the chain's own receipt, with a raw-key signing path and an optional Circle-managed signing path (`PAYOUT_CUSTODY_MODE=circle`)
- AI-assisted task drafting, submission evaluation, and fraud-risk analysis (Claude API) — each advisory only
- A wallet-scoped dashboard: My Tasks, Posted Tasks, Notifications, Earnings, Profile, and Settings, each showing only the connected wallet's own data
- An automatic in-app notification whenever an application is submitted
- Earnings and profile statistics computed live from the database (no cached or redundant totals)

**Not yet built:**

- Dashboard Overview is still mock data — it has not yet been migrated to the database
- Retrying a failed payout — a creator can decline it, but there is no in-app way to resubmit the same payout

## Technology stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Blockchain | Arc Testnet (EVM-compatible; USDC is the native gas token) |
| Wallet connectivity | wagmi + viem, via Circle App Kit's provider surface |
| Client data fetching | TanStack React Query |
| Database | Neon PostgreSQL (serverless) |
| ORM | Drizzle ORM + drizzle-kit |
| AI | Anthropic Claude API — task drafting, submission evaluation, fraud-risk analysis |

See [Architecture](docs/ARCHITECTURE.md) for how these fit together, and [Decisions](docs/DECISIONS.md) for why each was chosen.

## System architecture overview

The app is a single Next.js project. Server Components read global, non-personal data (the task catalog) directly from the database at render time. Anything scoped to the connected wallet — applications, notifications, earnings, profile, settings — is fetched client-side through a small set of API routes under `app/api/*`, because a Server Component currently has no way to know which wallet is connected in the browser. Every route and service goes through a single Drizzle client talking to Neon Postgres.

Full detail, including data-flow diagrams: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Folder structure

```
my-arc-app/
├── app/                      # Next.js App Router routes
│   ├── page.tsx              # Landing page
│   ├── marketplace/          # Browse, task details, apply
│   ├── dashboard/            # My Tasks, Posted Tasks, Earnings, Profile, Notifications, Settings, Overview
│   └── api/                  # Route Handlers — auth, tasks, applications, the applicant lifecycle, dashboard, AI
├── components/
│   ├── layout/                # Header, HeaderNav, Sidebar, MainLayout, Footer
│   ├── wallet/                 # ConnectWalletButton
│   ├── marketplace/            # TaskCard, SearchBar, FilterChips, TaskDetails, ApplyConfirmation, ...
│   └── dashboard/               # Per-section presentational components + client "Container" components
├── services/
│   ├── marketplace/             # Task reads (Drizzle-backed)
│   ├── applications/             # Application lifecycle (Drizzle-backed)
│   ├── payouts/                   # Payout records (Drizzle-backed)
│   ├── submissions/                # Submission + evaluation records (Drizzle-backed)
│   ├── fraud/                       # Fraud-signal computation (Drizzle-backed)
│   ├── users/                        # Wallet-to-user resolution (Drizzle-backed)
│   └── dashboard/                     # Notifications, earnings, profile, settings (Drizzle-backed), overview (still mock)
├── lib/                                 # arc/ (chain, funding/payout), circle/ (optional payout signing), ai/ (Claude features), auth/, rateLimit.ts
├── db/
│   ├── schema.ts                      # Drizzle schema — the single source of truth for all tables
│   ├── index.ts                        # Database client singleton
│   ├── migrations/                      # drizzle-kit generated SQL
│   └── seed.ts                           # Recreates the original marketplace fixture data
├── hooks/useWallet.ts                     # wagmi wrapper used throughout the app
├── providers/                               # AppProviders, QueryProvider, WagmiProvider, CircleProvider
├── types/                                     # Shared TypeScript contracts (task.ts, dashboard.ts, application.ts)
└── docs/                                        # This documentation set
```

## Installation

```bash
git clone <this-repository-url>
cd my-arc-app
npm install
```

## Environment variables

Create a `.env.local` file in the project root (this file is git-ignored and must never be committed).

**Server-only** (never exposed to the browser):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string. Required — the app will not start without it. |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key, powering AI-assisted task drafting, submission evaluation, and fraud-risk analysis (`lib/ai/`). Required only when one of those features is actually invoked. |
| `PAYOUT_CUSTODY_MODE` | Selects the payout-signing path: `raw-key` (default — used when unset or any value other than exactly `circle`) or `circle`. See `lib/arc/payoutRelay.ts`. |
| `ARC_EXECUTOR_PRIVATE_KEY` | Private key for the raw-key payout executor (`lib/arc/executor.ts`). Required when `PAYOUT_CUSTODY_MODE` is unset or `raw-key` (today's default). |
| `CIRCLE_API_KEY` | Circle Developer-Controlled Wallets API key (`lib/circle/client.ts`). Required only when `PAYOUT_CUSTODY_MODE=circle`. |
| `CIRCLE_ENTITY_SECRET` | Circle entity-level authorization secret, used alongside `CIRCLE_API_KEY` (`lib/circle/client.ts`). Required only when `PAYOUT_CUSTODY_MODE=circle`. |
| `CIRCLE_EXECUTOR_WALLET_ID` | The provisioned Circle wallet id used as the payout executor when `PAYOUT_CUSTODY_MODE=circle` (`lib/circle/executorWallet.ts`). Created once via `scripts/circle-provision-testnet-wallet.ts`, never at request time. |

**Client-exposed** (must use the `NEXT_PUBLIC_` prefix to be readable in the browser):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_ARC_RPC_URL` | Arc Testnet RPC endpoint used by viem/wagmi. |
| `NEXT_PUBLIC_ARC_NETWORK` | Network label (e.g. `testnet`). |

Always use Arc **Testnet** during development. No mainnet configuration exists in this project today.

## Database setup: Neon and Drizzle

1. Create a free project at [neon.tech](https://neon.tech) and copy its connection string into `DATABASE_URL` in `.env.local`.
2. Apply the existing schema to your database:
   ```bash
   npm run db:migrate
   ```
   This applies all pending migrations in `db/migrations/` to bring the database schema up to date.
3. (Optional but recommended for local development) Seed the marketplace with its original fixture tasks:
   ```bash
   npm run db:seed
   ```
4. If you ever change `db/schema.ts`, generate a new migration before applying it:
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#database-architecture) for the full schema and relationships, and [docs/DECISIONS.md](docs/DECISIONS.md) for why Neon and Drizzle were chosen.

## Running locally

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). Connect an injected wallet (e.g. MetaMask) and switch it to Arc Testnet when prompted to reach the wallet-scoped dashboard pages.

## Available scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Next.js development server (Turbopack) |
| `npm run build` | Production build — also runs the TypeScript type check |
| `npm run start` | Serve a production build |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate a new Drizzle migration from `db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `npm run db:seed` | Populate the database with the original marketplace fixture tasks |

Deploying beyond local development (Vercel, environment/secrets strategy, Neon branching, rollback): see **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. Documentation only today — no production deployment is currently authorized.

## Current project status

SIWE authentication, the full task/application/payout lifecycle, and the AI-assisted features described above are all implemented, backed by Neon Postgres via Drizzle, and scoped to the authenticated wallet's session. Dashboard Overview remains mock data. The project is testnet-only and **not** production-ready — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for current deployment status.

Full phase-by-phase history: **[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)** (a snapshot as of end of Phase 6 — see its own status note for what's changed since).

## Screenshots

_Screenshots are not yet included in this repository. Add them under `docs/screenshots/` and reference them here as the UI stabilizes further._

## Roadmap

Phases 6 through 10 — SIWE authentication, the task/payout lifecycle, AI integration, production hardening, and testnet launch-readiness work (Circle custody, deployment docs, load testing, legal scaffolding) — are complete. See [docs/ROADMAP.md](docs/ROADMAP.md) for the phase-by-phase history and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for what remains before any real deployment.

## Contributing

This project does not currently have a formal contribution process. If that changes, guidelines will be added here and linked from a `CONTRIBUTING.md` file.

## License

No license has been selected for this project yet. Until a `LICENSE` file is added, all rights are reserved by default.

## Acknowledgements

- [Arc Network documentation](https://docs.arc.network) — chain, RPC, and testnet reference
- [Arc Explorer](https://explorer.arc.network)
- [Circle Developer documentation](https://developers.circle.com/docs), [Circle AppKit](https://developers.circle.com/w3s/docs), [Circle Wallets](https://developers.circle.com/w3s/docs/programmable-wallets-overview)
- [Neon](https://neon.tech) — serverless PostgreSQL
- [Drizzle ORM](https://orm.drizzle.team)
- [Anthropic](https://www.anthropic.com) — Claude API, powering task drafting, submission evaluation, and fraud-risk analysis
