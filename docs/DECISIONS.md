# Architecture Decision Records

This document records the major technical decisions behind Nano Task Marketplace and why each was made. For what the resulting architecture looks like, see [ARCHITECTURE.md](./ARCHITECTURE.md). Decisions are numbered in roughly the order they were made and are not renumbered when superseded — a superseded decision says so explicitly.

---

## ADR-001: Next.js App Router

**Decision:** Build on Next.js 16's App Router, not the Pages Router or a separate frontend/backend split.

**Context:** The project needed a React framework capable of both server-rendering global content and supporting client-side interactivity for wallet state, with a place to put backend logic without standing up a separate service.

**Reasoning:** App Router's Server/Client Component split maps directly onto the project's actual data-ownership split: global data (the task catalog) is naturally server-rendered, while wallet-scoped data is naturally client-owned. Route Handlers (`app/api/*`) provide a backend without a second deployable.

**Alternatives considered:** A separate Express/Fastify API with a Vite or Pages-Router frontend — rejected as unnecessary operational overhead for a single-team project where Next.js Route Handlers already cover the API surface needed.

**Consequences:** The project has exactly one deployable. The cost is the client-fetch waterfall every wallet-scoped page pays for today, since there's no session yet for Server Components to read (see [ADR-008](#adr-008-client-components-for-wallet-interactions) and [PROJECT_STATUS.md](./PROJECT_STATUS.md)).

---

## ADR-002: React Query for client-side data

**Decision:** Use TanStack React Query for every wallet-scoped data fetch, rather than hand-rolled `useEffect`/`useState` fetching.

**Context:** `QueryProvider` and a `QueryClient` already existed in the project from before Phase 5, unused. Phase 5 needed a consistent way for five different Client Components to fetch, cache, and re-fetch wallet-scoped data on wallet change.

**Reasoning:** Reusing the already-configured client meant no new dependency, and React Query's built-in loading/error state and cache invalidation on query-key change (`[feature, address]`) is exactly the shape "refetch when the wallet changes" needs, without writing that logic five times by hand.

**Alternatives considered:** Plain `useEffect` + `fetch` per Container — rejected as reinventing what the already-installed library does correctly, and as harder to keep consistent across five nearly-identical components.

**Consequences:** The pre-existing 60-second `staleTime` (not changed during Phase 5) means a same-session user can see slightly stale data after a write until either 60 seconds pass or the page is refreshed — see [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md).

---

## ADR-003: Drizzle instead of Prisma

**Decision:** Use Drizzle ORM for all database access.

**Context:** Phase 5 needed to choose an ORM before writing the schema or any service.

**Reasoning:** Drizzle's schema-as-TypeScript approach requires no code-generation step in the development loop; it has no bundled query-engine binary, which matters directly for cold-start time in the serverless functions this app deploys as; and its SQL-like query builder maps cleanly onto the aggregate (`SUM`/`COUNT … FILTER`) queries the Earnings and Profile features need.

**Alternatives considered:** Prisma — a reasonable, more batteries-included alternative, particularly for its migration tooling UX. Not chosen because of the cold-start and codegen-step tradeoffs above.

**Consequences:** Migrations are plain generated SQL files, reviewed directly rather than through a Prisma-specific abstraction. The team accepts a smaller ecosystem of examples/tooling than Prisma has in exchange for the runtime characteristics above.

---

## ADR-004: Neon PostgreSQL

**Decision:** Use Neon as the managed Postgres provider, and specifically its WebSocket-capable `Pool` driver (`@neondatabase/serverless`) rather than the simpler HTTP-only `neon-http` driver.

**Context:** The domain (users → tasks → applications → payouts) is relational and foreign-key-heavy, and needs real transactional guarantees — for example, approving an application and creating its payout must eventually happen atomically.

**Reasoning:** Postgres fits the relational shape directly. Neon specifically offers serverless scaling and a branching model suited to a project still under active development. The `Pool` driver (over `neon-http`) was chosen specifically to preserve multi-statement transaction support for that future atomic-approval-plus-payout work, even though nothing in the current codebase uses a transaction yet.

**Alternatives considered:** A document store — rejected, since the relationships and integrity constraints (e.g., one application per wallet per task, enforced by a unique index) are exactly what a document store would leave unenforced. `neon-http` — rejected specifically because it does not support the transaction shape future phases will need.

**Consequences:** The app depends on a WebSocket-capable connection at all times, which is a slightly heavier runtime dependency than the HTTP-only driver would have been, in exchange for transaction support that isn't yet exercised but was deliberately kept available.

---

## ADR-005: Wallet-first identity

**Decision:** Use the connected wallet address as the application's identity key, before any authentication mechanism exists.

**Context:** Phase 5.3 introduced real Applications and needed *some* notion of "whose application is this" before Phase 5.4 could make it wallet-specific, and before real authentication (Phase 6) was in scope.

**Reasoning:** The product is wallet-native by design — there is no email/password concept anywhere in it. Using the wallet address directly as identity, ahead of building signature verification, let every wallet-scoped feature (My Tasks, Notifications, Earnings, Profile, Settings) be built and demonstrated end-to-end without authentication becoming a blocking dependency for the rest of Phase 5.

**Alternatives considered:** Building SIWE first, before any wallet-scoped feature — rejected because it would have blocked five feature migrations behind one auth implementation, for no benefit until those features actually existed to protect.

**Consequences:** This is the project's most significant known limitation today. Wallet address is currently a **claim**, not a **proof** — see [ARCHITECTURE.md](./ARCHITECTURE.md#current-authentication-approach) and [PROJECT_STATUS.md](./PROJECT_STATUS.md#current-security-status) for the direct implications, and [ROADMAP.md](./ROADMAP.md#current-phase) for the plan to close this gap.

---

## ADR-006: Incremental backend migration strategy

**Decision:** Migrate one mock service at a time, in dependency order, rather than replacing the entire mock backend in one pass.

**Context:** At the start of Phase 5, every dashboard and marketplace feature ran entirely on in-memory mock data with no persistence.

**Reasoning:** A single all-at-once migration would have made it far harder to isolate the bugs that incremental migration actually caught — a unique-constraint-detection bug in Applications, a cross-dependency between Profile and Earnings that only the build surfaced, and others recorded in [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md). Each phase closing with a passing build and a browser-driven verification kept the application demoable at every intermediate step.

**Alternatives considered:** A single large migration branch, merged once complete — rejected as higher-risk and harder to verify incrementally, and as leaving the application non-functional for the duration of the work.

**Consequences:** The migration took eight sub-phases instead of one, but every one of them shipped a working, verified application.

---

## ADR-007: Server Components by default

**Decision:** Default every new page and every piece of genuinely global data to a Server Component; only convert to a Client Component when a real client-side need (wallet state, interactivity, browser APIs) exists.

**Context:** Applies throughout the whole application, not just Phase 5.

**Reasoning:** Server Components avoid shipping unnecessary JavaScript and avoid a client-fetch waterfall for data that doesn't depend on anything only the browser knows. The marketplace catalog, task details, and Dashboard Overview all fit this description.

**Alternatives considered:** Making every page a Client Component uniformly, for consistency — rejected as unnecessarily shipping client JavaScript and network round-trips for data that has no per-user or per-browser dependency.

**Consequences:** The codebase has two distinct data-fetching idioms (direct server-side call vs. client fetch through an API route) rather than one — see [ARCHITECTURE.md](./ARCHITECTURE.md#data-flow) for exactly where the line falls.

---

## ADR-008: Client Components for wallet interactions

**Decision:** Any component that needs to know the connected wallet's address, connection status, or network — or that performs a write — is a Client Component, narrowly scoped to just that need.

**Context:** wagmi's hooks (`useConnection`, `useConnect`, etc.) are React hooks and only work in Client Components; there is currently no session mechanism that would let a Server Component learn the connected wallet another way.

**Reasoning:** Given no session exists yet (see [ADR-005](#adr-005-wallet-first-identity)), a Client Component reading `useWallet()` is the *only* way any part of the app can currently know which wallet is connected. The "Container" component pattern (`MyTasksContainer`, `NotificationsContainer`, `EarningsContainer`, `ProfileStatsContainer`, `SettingsContainer`) keeps this Client Component boundary as narrow as possible — wrapping only the data-dependent piece of a page, never the whole page.

**Alternatives considered:** A cookie-based "remember the last connected address" hint written client-side, read server-side — rejected as a fake session that would look like security without providing any, worse than being honest that no session exists yet.

**Consequences:** Every wallet-scoped page pays for a client-fetch round trip that a session-aware Server Component wouldn't need. This is expected to be revisited, not just extended, once Phase 6 introduces real sessions.

---

## ADR-009: Database-backed services replaced mocks incrementally, keeping file paths stable

**Decision:** When migrating a mock service, keep its existing file path and exported function names wherever possible, and change only what's inside the function body.

**Context:** Every mock service (`services/*/mock*.ts`) already returned data shaped exactly like the real `types/*.ts` contracts its components expected.

**Reasoning:** Since the shape was already correct, the only thing that needed to change was *where the data came from* — not how components consumed it. Keeping the same import path meant zero consuming files needed to change, which is the direct mechanism behind "no component was ever redesigned during Phase 5."

**Alternatives considered:** Renaming each service on migration (e.g. `mockTasks.ts` → `taskService.ts`) for naming accuracy — considered and explicitly rejected each time it came up, in favor of minimizing the diff. This is recorded as a deliberate, still-open cosmetic tradeoff in [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md).

**Consequences:** Several files under `services/dashboard/` are still named `mock*.ts` despite containing zero mock logic. This is confusing to a first-time reader of the codebase and is the one piece of intentional short-term naming debt the project carries forward.

---

## ADR-010: Technical debt was intentionally deferred, not accidentally accumulated

**Decision:** Explicitly scope every Phase 5 sub-phase to "migration only" — no new functionality, no authentication, no editable settings, no payout execution — even where a natural extension point was visible.

**Context:** Phase 5's stated goal was replacing mock data sources with real ones without changing behavior. Several sub-phases (Settings, in particular) surfaced places where "just add one more real feature while I'm here" was tempting but not asked for.

**Reasoning:** Keeping every phase narrowly scoped made each one easier to verify completely, and kept the migration's actual goal — a working database underneath an unchanged UI — from sliding into an open-ended feature-development effort with a much larger, harder-to-verify surface area.

**Alternatives considered:** Opportunistically building small adjacent features (e.g., a "display name" settings field, since the `users` table already has the column) during the relevant migration phase — rejected in each case in favor of recording the opportunity in [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md) instead and leaving the scope decision to a deliberate future phase.

**Consequences:** The technical debt backlog is larger and more explicit than it would be otherwise, but every item on it was a conscious choice, with a documented reason, rather than an unnoticed gap.
