# Technical Debt Backlog

Every item here was **intentionally deferred**, not accidentally missed — see [DECISIONS.md#adr-010](./DECISIONS.md#adr-010-technical-debt-was-intentionally-deferred-not-accidentally-accumulated) for why that distinction matters. Each entry explains why it was postponed, so a future contributor can judge whether that reason still holds before picking it up. Organized by priority; within each priority, grouped by area.

Cross-references: [ROADMAP.md](./ROADMAP.md) for which future phase each item is likely to belong to, [ARCHITECTURE.md](./ARCHITECTURE.md) for how the current system works, [PROJECT_STATUS.md](./PROJECT_STATUS.md) for the current-state summary these items feed into.

---

## High Priority

Items that block production readiness or represent an active security gap.

### Authentication

- **SIWE (Sign-In With Ethereum) implementation.** Wallet address is currently a client-supplied claim with no signature check. This is the single highest-priority item in the project. Deferred because Phase 5's scope was explicitly "identity only" — see [DECISIONS.md#adr-005](./DECISIONS.md#adr-005-wallet-first-identity).
- **Remove `walletAddress` from client request bodies/query params as the trust boundary.** `POST /api/applications` accepts `walletAddress` directly in the JSON body; every `GET` route accepts `?wallet=` with no verification. Deferred for the same reason as SIWE — this and SIWE are really one piece of work, since the fix *is* replacing the trust boundary.
- **Protect API routes behind session validation.** All five routes are currently open to anyone who can guess or observe a wallet address. Deferred until sessions exist to protect them with (Phase 6).

### Database

- **Add secondary indexes on foreign-key columns used in wallet-scoped joins:** `applications.applicant_id`, `payouts.application_id`, `notifications.user_id`. Invisible at current (test-fixture) data volume, since Postgres happily sequential-scans a handful of rows. Deferred because index tuning against realistic data volume wasn't yet possible to validate meaningfully — adding indexes speculatively without a query-plan justification is its own minor debt.

### Payments

- **Automatic payout generation.** Every `payouts` row in the database today exists only from manual test seeding; nothing in the application creates one. Explicitly excluded from Phase 5 ("Do not add Circle payout functionality yet" was stated directly in the Earnings migration's scope).
- **Transaction lifecycle tracking.** `payouts.tx_hash` exists in the schema but nothing ever populates or reads it. Blocked on the above — there's no transaction to track until payouts are actually executed.

### Applications

- **Approval workflow.** `applications.status` can only ever become `'applied'` through the app itself today; `'approved'`, `'rejected'`, and `'completed'` exist only because they were manually seeded for testing Earnings and Profile aggregation. Deferred because it requires a product decision — who is allowed to approve an application, the task creator or an admin — that hasn't been made yet.
- **Rejection workflow.** Same status, same blocker as approval.
- **Completion lifecycle.** Same blocker; completion is also the trigger point for payout creation, so it's coupled to the Payments items above.

### Testing

- **No automated test suite exists in this project at all** — no unit tests, no integration tests, no committed end-to-end tests. Every verification performed during Phase 5 (Playwright browser checks, direct database queries) was run from temporary, disposable scripts and deleted after use rather than checked in. This is a real, meaningful gap for a project of this size. Deferred because each phase's own manual-but-rigorous verification loop (build, then browser-drive, then database-check) was judged sufficient to ship each migration correctly, but that discipline does not protect against future regressions the way a committed suite would.

---

## Medium Priority

Items that meaningfully improve correctness, performance, or maintainability, but do not block current functionality.

### Marketplace

- **Server-side search.** All filtering (text search, category) currently happens client-side in `MarketplaceBrowser` over the full fetched task array. Fine at the current catalog size; won't scale as the number of tasks grows. Deferred because it was out of scope for a like-for-like mock-to-database migration — the mock version also filtered client-side, so this preserves existing behavior rather than being a regression.
- **Better filtering** (reward range, difficulty, estimated time). No such filters exist today, only category and free-text search. Deferred as a net-new feature, not part of a migration.

### Applications

- **Withdrawal.** An applicant cannot currently cancel or withdraw an application once submitted. Deferred alongside the approval/rejection/completion workflow, since it's part of the same unbuilt lifecycle.

### Dashboard

- **Replace remaining mock-backed Dashboard Overview data.** `WelcomeSection`, `SummaryCardsGrid`, and `RecentActivity` are still fully mock-driven — the only dashboard page never touched by Phase 5. Deferred because it was explicitly out of scope in every one of the eight sub-phases' protected-area lists.
- **Improve caching / cache invalidation on write.** React Query's pre-existing 60-second `staleTime` is not invalidated when a write happens elsewhere — for example, submitting an application doesn't invalidate the `["notifications", address]` query key even though it just created one, so a same-session user may not see a brand-new notification without a manual refresh. Deferred because "refreshing the page is sufficient" was explicitly permitted when Notifications was migrated, and the `staleTime` setting itself predates Phase 5.

### Notifications

- **Mark as read.** `notifications.is_read` exists and is read by the UI (driving the unread badge and count), but nothing in the application ever sets it to `true` — there is no API or UI action to mark a notification read. A concrete, specific gap worth calling out precisely, since the column already exists and only the write path is missing.
- **More notification types.** The `notification_type` enum includes `payment`, `wallet`, and `system` alongside `task`, but only `task` (specifically, "Application Submitted") is ever actually created by the application today.

### Settings

- **Persist user preferences.** None of Settings' four sections (Appearance, Notification preferences, Security, About) have any backing column in the schema — the content is identical for every wallet. Deferred because fixing it needs either a new preference-storage table (explicitly out of scope during Phase 5) or a product decision about what should be editable.
- **Real user-configurable settings.** Every control on the Settings page is currently informational/read-only by explicit design. Blocked on the same product decision as above.

### Security

- **Better request validation.** Current validation is limited to wallet-address regex format checks and basic type/presence checks; there's no deeper schema validation (e.g. via Zod) on request bodies. Deferred as acceptable for the current, narrow API surface, but worth revisiting as more write endpoints are added.
- **CSRF protection.** Not yet meaningful without a session cookie to forge, but will become a real requirement the moment Phase 6 introduces one — recorded here so it isn't forgotten when that happens.

### Performance

- **React Query optimization** — no prefetching and no optimistic updates exist anywhere (e.g., applying doesn't optimistically show the application in My Tasks before the server confirms it). Deferred as a polish item once the core read/write paths were working correctly.

### Testing

- **Integration tests** for the service layer (the functions that actually call Drizzle) and **API route tests** for the five Route Handlers. Deferred alongside the broader lack of a test suite noted under High Priority — these are the next layer up once a testing framework decision is made.
- **A committed Playwright end-to-end suite.** Ironically, extensive Playwright verification happened *during* Phase 5 development — including a synthetic EIP-6963 wallet provider built to test multi-wallet isolation — but every script was written to a temporary scratch location and deleted after use, not preserved as a repeatable suite.

### Documentation

- **A deployment guide.** Nothing currently documents how to actually ship this application to a hosting provider (environment variable setup in that provider, database branch strategy, etc.). Deferred because the project has not yet been deployed anywhere beyond local development.

---

## Low Priority

Cosmetic, cleanup, or genuinely optional items — real, but with no functional or security impact.

### Database

- **Query optimization / review for N+1-adjacent patterns** as new features are added. Nothing currently exhibits this, since every service function issues one well-formed query, but it's worth a periodic look as the codebase grows.

### Marketplace

- **Pagination.** The task list currently returns its full result set. Fine at eight-to-a-few-dozen tasks; will matter eventually.
- **Sorting.** No sort options exist (by reward, by recency, etc.) beyond the database's default ordering.

### Performance

- **Component consolidation / a shared hook.** The five wallet-scoped "Container" components (`MyTasksContainer`, `NotificationsContainer`, `EarningsContainer`, `ProfileStatsContainer`, `SettingsContainer`) share a nearly identical shape — `useWallet()` + `useQuery()` + a local, non-exported `StateCard` for the connect/loading/error states. This duplication was a deliberate choice each time (see [DECISIONS.md](./DECISIONS.md)) to avoid touching a previously-completed, protected feature just to extract a shared abstraction — but a shared `useWalletScopedQuery` hook and a shared `StateCard` component are a reasonable, low-risk consolidation opportunity now that the pattern has proven stable across five independent uses.

### Naming

- **Rename the `mock*.ts` service files that no longer contain mock logic**: `mockTasks.ts`, `mockNotificationService.ts`, `mockEarningsService.ts`, `mockProfileService.ts`, `mockSettingsService.ts`. Deferred deliberately in every phase to keep import paths stable — see [DECISIONS.md#adr-009](./DECISIONS.md#adr-009-database-backed-services-replaced-mocks-incrementally-keeping-file-paths-stable). Purely cosmetic; never requested.

### Security

- **Audit logging.** No record of who performed which write beyond the timestamp columns already on each table. Deferred as low-impact while the application has no authenticated users to attribute actions to meaningfully.

### Documentation

- **A formal API specification** (e.g. OpenAPI/Swagger) beyond the plain-language route table in [ARCHITECTURE.md](./ARCHITECTURE.md#api-architecture).
- **A `CONTRIBUTING.md`.** No formal contribution process exists yet — noted as a placeholder in the project [README](../README.md#contributing).
