# Project Status

**Snapshot as of:** end of Phase 5 (database migration complete), immediately prior to Phase 6.

A concise executive summary of where Nano Task Marketplace stands. For depth: [ARCHITECTURE.md](./ARCHITECTURE.md) (how it's built), [DECISIONS.md](./DECISIONS.md) (why), [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md) (what's deferred), [ROADMAP.md](./ROADMAP.md) (what's next).

---

## Overall completion status

The application is **functionally complete for a single-honest-user demonstration** and **not production-ready**. Every feature that was mock data at the start of Phase 5 — except Dashboard Overview — is now backed by a real, persistent PostgreSQL database, correctly scoped per wallet. The gap between "works correctly" and "production-ready" is authentication: the application currently trusts any wallet address a client claims, with no cryptographic proof.

## Completed functionality

- Wallet connection to Arc Testnet, with network detection and a guided switch prompt
- Marketplace: database-backed browsing, live search, category filtering, task detail pages
- A real application flow, with database-enforced duplicate-application prevention
- Wallet-scoped My Tasks, Notifications, Earnings, and Profile, each correctly showing only the connected wallet's own data
- An automatic notification generated on every successful application
- Earnings and Profile statistics computed live via SQL aggregation, with no cached or redundant totals
- Settings, migrated architecturally (a real, wallet-scoped, database-backed route) though its content remains informational and identical for every wallet — see [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md#settings)

## Remaining functionality

- Cryptographic wallet authentication (SIWE) — see [Next priorities](#next-priorities)
- Application approval, rejection, and completion workflow
- Real payout creation and execution
- Dashboard Overview migration off mock data
- AI-driven task generation, submission evaluation, and fraud detection (part of the original product vision; not started)
- Editable, persisted settings

## Current architecture maturity

The data layer is mature and consistent: one schema (six tables, unchanged since it was first defined), one ORM, one client singleton, a single well-repeated pattern for every wallet-scoped feature (Client Component → React Query → API route → service → Drizzle). The authentication layer does not exist. This asymmetry is the project's defining characteristic right now — a clean, well-verified backend underneath a trust model that isn't safe to rely on yet.

## Current security status

**Wallet connection is not authentication.** A connected wallet's address is accepted as-is, in a plain query parameter or JSON field, with no signature ever requested or verified. Concretely: any client can currently call the API directly and act as any wallet address, without ever having controlled that wallet. This was a deliberate, disclosed scope boundary throughout Phase 5, not an oversight — see [DECISIONS.md#adr-005](./DECISIONS.md#adr-005-wallet-first-identity) — but it means the application must not be exposed to real users or real value until Phase 6 closes this gap. No rate limiting, CSRF protection, or audit logging exist either; see [TECHNICAL_DEBT.md#security](./TECHNICAL_DEBT.md#security).

## Production readiness assessment

**Not production-ready.** At minimum, Phase 6 (authentication) must be complete before any real-user exposure is reasonable. Realistically, Phase 7 (a real payout lifecycle) is also needed before "USDC rewards" is more than a demonstration — right now, every payout in the database exists only because it was manually inserted for testing.

## Known limitations

- No authentication (see above)
- No secondary indexes on the foreign-key columns every wallet-scoped query joins on
- No pagination anywhere in the application
- No automated test suite (unit, integration, or end-to-end)
- Dashboard Overview still fully mock
- Settings has no genuine per-wallet content
- Notifications can be created but never marked read — the column exists, the write path doesn't

Full list: [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md).

## Major risks

- **Identity spoofing.** The most significant open risk — see Current security status above. Any pre-launch exposure of this application carries this risk directly.
- **Data integrity at scale.** The unindexed foreign-key columns are invisible today and will not stay invisible once real usage exists; this is a latency risk, not a correctness one, but worth planning for ahead of time rather than reactively.
- **Scope drift in Phase 6.** SIWE touches every existing route; there is a real risk of it expanding into a larger rewrite if not scoped as tightly as Phase 5's migrations were.

## Next priorities

1. Sign-In With Ethereum (Phase 6) — the hard prerequisite for everything after it.
2. A session-aware server-side identity mechanism, unlocking a return to Server Components for wallet-scoped pages.
3. The application lifecycle (approve/reject/complete) and real payout creation (Phase 7).

## Estimated remaining phases

Four planned phases remain before the project reaches the production-hardening stage: **Phase 6** (authentication), **Phase 7** (task lifecycle & payouts), **Phase 8** (AI integration), and **Phase 9** (production hardening), with a further **Phase 10** (launch readiness) beyond that. See [ROADMAP.md](./ROADMAP.md) for what each covers.
