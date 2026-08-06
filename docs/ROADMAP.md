# Roadmap

A living record of where Nano Task Marketplace has been and where it's headed. Update this document as each phase completes — add newly-completed phases to the top section, promote the next planned phase into "Current Phase," and extend "Planned Phases" as the horizon becomes clearer.

Cross-references: [PROJECT_STATUS.md](./PROJECT_STATUS.md) for a snapshot of exactly where things stand right now, [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md) for the backlog feeding into these phases, [DECISIONS.md](./DECISIONS.md) for why past phases were sequenced the way they were.

> **A note on Phases 1–4:** these predate this documentation set and were tracked conversationally rather than as separate, individually-committed changes — `git log` shows them landing in a single bundled commit (`Complete frontend and database foundation`) alongside the start of Phase 5. The summaries below are an accurate reconstruction of what each phase produced, grouped by function; if your own recollection of the exact phase boundaries differs, this document is meant to be edited to match.

---

## Completed Phases

### Phase 1 — Foundation & Wallet Connectivity

Established the Next.js 16 App Router project, Tailwind CSS v4, and the provider stack (`QueryProvider`, `WagmiProvider`, `CircleProvider`). Defined the Arc Testnet chain configuration and built `useWallet()` and `ConnectWalletButton` — connect/disconnect, network detection, and a guided switch-to-Arc-Testnet flow. Shipped the initial landing page (hero, Connect Wallet call-to-action, stats row).

### Phase 2 — Marketplace (mock data)

Built task browsing, live search, and category filtering (`MarketplaceBrowser`, `SearchBar`, `FilterChips`, `TaskCard`), task detail pages, and an apply flow (`TaskDetails`, `ApplyConfirmation`) — all running against an in-memory mock task list with no backend.

### Phase 3 — Dashboard foundation

Established the dashboard shell: `DashboardLayout`, `Sidebar`, `Header`/`HeaderNav`, and the six-page dashboard route structure (Overview, My Tasks, Earnings, Profile, Notifications, Settings), with the first mock-backed pages built against it.

### Phase 4 — Dashboard feature completion

Completed the remaining mock-backed dashboard pages (Earnings, Profile, Notifications, Settings, Overview) and corrected navigation routing across `Sidebar` and `Header`. **Phase 4.5 — UI Polish & Quality Assurance** followed as a dedicated cross-application pass: responsive behavior checked across mobile/tablet/desktop, a console-error sweep, and a visual consistency review, verified with Playwright. Immediately before Phase 5, the Task Details page's Apply button was made consistent with the Marketplace card's Apply button, reusing the existing (still mock) apply flow.

### Phase 5 — Backend migration

Replaced every mock data source with a real, persistent backend — incrementally, one service at a time, without redesigning any UI component. Eight sub-phases: database foundation (schema + Neon + Drizzle), Marketplace, Applications (built from nothing — the mock version had no backend at all), Wallet Identity (replacing a temporary demo user with real per-wallet identity), Notifications, Earnings, Profile, and Settings. A separate, more detailed Phase 5 Completion Report was produced alongside this documentation set; if it's added to the repository (for example under `docs/reports/`), link it here.

**Result:** Marketplace, Applications, Notifications, Earnings, Profile, and Settings are all backed by Neon PostgreSQL via Drizzle, scoped to the connected wallet. Dashboard Overview remains mock data. See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for the full current-state snapshot.

---

## Current Phase

### Phase 6 — Wallet Authentication (SIWE)

**Primary objectives:**

- Replace the current unverified, client-supplied wallet address with a cryptographically verified Sign-In With Ethereum flow: nonce issuance, message signing via wagmi, server-side verification via viem, and a real session.
- Populate and put the already-defined `sessions` table to use for the first time.
- Protect the five existing API routes behind session validation instead of a trusted query parameter.
- Re-evaluate which wallet-scoped pages can move back to server-rendering now that a session exists to read.

See [DECISIONS.md#adr-005](./DECISIONS.md#adr-005-wallet-first-identity) and [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md#authentication) for the full context this phase closes out.

---

## Planned Phases

### Phase 7 — Task Lifecycle & Payouts

Build the application approval / rejection / completion workflow, and connect real payout creation. Turns `payouts` rows and non-`'applied'` application statuses from test-only fixtures into genuine product behavior. Migrate Dashboard Overview off mock data as part of this phase, since real activity data will exist for it to summarize by this point.

### Phase 8 — AI Integration

Build the AI-driven task generation, submission evaluation, and fraud detection described in the project's original vision, using the Claude API (`ANTHROPIC_API_KEY` is already reserved for this and unused today). This is the one major piece of the original product concept that no phase so far has touched.

### Phase 9 — Production Hardening

Rate limiting on write routes, the secondary indexes identified in [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md#database), a query-performance review at realistic data volume, monitoring and observability, and a full security review of the API surface ahead of handling real funds.

### Phase 10 — Launch Readiness

Everything required to move from Arc Testnet toward a real, public-facing deployment: production credentials for Circle, a deployment and operations guide, load testing, and a review of compliance/terms-of-service considerations appropriate for a global, wallet-based payments product.

---

## Major Milestones

**Reached:**

- Wallet connectivity to Arc Testnet established
- A complete, navigable product experience across Marketplace and Dashboard (mock data)
- A dedicated UI/QA pass across the whole application
- Full migration to a persistent, relational database
- A wallet-scoped, multi-user-capable data model (any number of distinct wallets can use the app with correctly isolated data)

**Future:**

- First cryptographically authenticated session (Phase 6)
- First real, non-test-seeded payout executed (Phase 7)
- First AI-generated task and AI-evaluated submission (Phase 8)
- First rate-limited, index-reviewed production deployment (Phase 9)
- Public / mainnet-adjacent launch (Phase 10)

---

## Stretch Goals

Optional future improvements beyond the phases above — not currently scheduled.

- Deployment beyond Arc Testnet (a real mainnet, once one is appropriate for this product)
- A packaged mobile experience or installable PWA
- Localization / multi-language support, in keeping with the project's "anyone in the world" motivation
- A richer reputation and dispute-resolution system beyond a single numeric score
- Expanded task categorization, tagging, and creator profiles/storefronts
- Webhooks or third-party integrations for task creators
- An admin/moderation dashboard
