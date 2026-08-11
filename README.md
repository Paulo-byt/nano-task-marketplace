# Nano Task Marketplace

A global micro-task marketplace where anyone with a crypto wallet can post or complete small tasks and get paid instantly in USDC, settled on the Arc blockchain.

> **Status:** Backend migration complete (Phase 5). Wallet-based identity is in place; cryptographic wallet **authentication** is not yet implemented. Not production-ready — see [Project Status](docs/PROJECT_STATUS.md).

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

The longer-term product vision (see [Roadmap](docs/ROADMAP.md)) includes Claude generating tasks, evaluating submissions, and detecting fraud automatically. That AI layer has not been built yet — the project so far has focused on the marketplace, application, and dashboard experience and the database backend underneath it.

## Motivation

Traditional micro-task and gig platforms require bank accounts, national ID verification, and payment rails that exclude a large part of the world. By settling in USDC on a low-cost EVM-compatible chain and using a wallet address as the unit of identity, Nano Task Marketplace aims to let anyone, anywhere, earn from small tasks with nothing more than a crypto wallet.

## Key features

**Implemented today:**

- Wallet connection to Arc Testnet (injected wallets such as MetaMask), with network-mismatch detection and a guided switch-network prompt
- Marketplace browsing with live search and category filtering, backed by a real database
- Task detail pages and a real application flow, with duplicate-application prevention
- A wallet-scoped dashboard: My Tasks, Notifications, Earnings, Profile, and Settings, each showing only the connected wallet's own data
- An automatic in-app notification whenever an application is submitted
- Earnings and profile statistics computed live from the database (no cached or redundant totals)

**Planned, not yet built:**

- Cryptographic wallet authentication (Sign-In With Ethereum) — see [Decisions](docs/DECISIONS.md) and [Roadmap](docs/ROADMAP.md)
- Application approval / rejection / completion workflow
- Real payout execution via Circle
- AI-driven task generation, submission evaluation, and fraud detection (Claude API)
- Dashboard Overview is still mock data — it has not yet been migrated to the database

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
| AI (reserved, not yet integrated) | Anthropic Claude API |

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
│   ├── dashboard/            # My Tasks, Earnings, Profile, Notifications, Settings, Overview
│   └── api/                  # Route Handlers (applications, notifications, earnings, profile, settings)
├── components/
│   ├── layout/                # Header, Sidebar, MainLayout, DashboardLayout
│   ├── wallet/                 # ConnectWalletButton
│   ├── marketplace/            # TaskCard, SearchBar, FilterChips, TaskDetails, ApplyConfirmation, ...
│   └── dashboard/               # Per-section presentational components + client "Container" components
├── services/
│   ├── marketplace/             # Task reads (Drizzle-backed)
│   ├── applications/             # Application create/read (Drizzle-backed)
│   ├── users/                     # Wallet-to-user resolution (Drizzle-backed)
│   ├── dashboard/                  # Notifications, earnings, profile, settings (Drizzle-backed), overview (still mock)
│   └── payments/, ai/                # Reserved, not yet implemented
├── db/
│   ├── schema.ts                      # Drizzle schema — the single source of truth for all tables
│   ├── index.ts                        # Database client singleton
│   ├── migrations/                      # drizzle-kit generated SQL
│   └── seed.ts                           # Recreates the original marketplace fixture data
├── hooks/useWallet.ts                     # wagmi wrapper used throughout the app
├── providers/                               # AppProviders, QueryProvider, WagmiProvider, CircleProvider
├── lib/                                       # arc/chains.ts, utils/address.ts, utils/date.ts
├── types/                                       # Shared TypeScript contracts (task.ts, dashboard.ts, application.ts)
└── docs/                                          # This documentation set
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
| `ANTHROPIC_API_KEY` | Reserved for the planned Claude-powered task generation/evaluation features. Not yet consumed by any code. |
| `CIRCLE_API_KEY` | Reserved for Circle-integrated payout functionality. Not yet consumed by any code. |
| `DATABASE_URL` | Neon PostgreSQL connection string. Required — the app will not start without it. |

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
   This runs the single migration already checked into `db/migrations/`, creating all six tables (`users`, `tasks`, `applications`, `payouts`, `notifications`, `sessions`).
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

Phase 5 (mock-to-database migration) is complete. Marketplace, Applications, Notifications, Earnings, Profile, and Settings are all backed by Neon Postgres via Drizzle and scoped to the connected wallet's address. Dashboard Overview remains mock data. There is no authentication layer yet — a connected wallet address is trusted as-is, without a signature. The project is functional for demonstration purposes and is **not** production-ready.

Full detail: **[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)**.

## Screenshots

_Screenshots are not yet included in this repository. Add them under `docs/screenshots/` and reference them here as the UI stabilizes further._

## Roadmap

Phase 6 (next up) introduces Sign-In With Ethereum so that wallet identity becomes cryptographically verified rather than a trusted client claim. Later phases cover the task approval/payout lifecycle, the planned AI integration, and production hardening.

Full detail: **[docs/ROADMAP.md](docs/ROADMAP.md)**.

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
- [Anthropic](https://www.anthropic.com) — Claude API, reserved for planned AI features
