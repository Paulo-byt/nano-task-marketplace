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

### Phase 6 — Wallet Authentication (SIWE)

Replaced the unverified, client-supplied wallet address with a cryptographically verified Sign-In With Ethereum flow: nonce issuance (`POST /api/auth/nonce`), wagmi message signing, server-side signature verification via viem's `recoverMessageAddress` (`POST /api/auth/verify`), and a real httpOnly-cookie session backed by the `sessions` table defined back in Phase 5.1 and unused until now. Ten steps, each cutting over server and client together with no transitional dual-support period: session/SIWE helper functions, the three auth routes, `useWallet()`'s three-state UX (not connected / connected-but-not-signed-in / signed-in), the write route (`POST /api/applications`), then the four remaining read routes (`GET /api/applications`, `/api/notifications`, `/api/earnings`, `/api/profile`, `/api/settings`) one at a time with their Containers, closing with a full security and architecture audit.

One originally-scoped objective — re-evaluating whether wallet-scoped pages could move back to server-rendering now that a session exists to read — was **not** part of the actual executed implementation and remains deferred to a future phase; every wallet-scoped page is still a Client Component using the same Container pattern established in Phase 5.

**Result:** all five previously wallet-scoped read routes, plus the one write route, now resolve identity exclusively from the session cookie via `getSessionUser()` — zero routes read `?wallet=` or trust a client-supplied `walletAddress`. Verified by a dedicated Step 10 audit: nonce reuse, invalid signatures, and wrong-wallet signatures are all rejected; expired sessions are rejected; logout deletes the session row; the cookie is never readable by client-side JavaScript; and two isolated test wallets showed no cross-user data leakage across any route, including forged-parameter attempts using real other-wallet addresses. No application-code bugs were found. See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for the full current-state snapshot and [TECHNICAL_DEBT.md#resolved](./TECHNICAL_DEBT.md#resolved) for what this closed out.

---

## Current Phase

None. Phase 6 is complete; Phase 7 has not yet begun.

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
- First cryptographically authenticated session (Phase 6)

**Future:**

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
