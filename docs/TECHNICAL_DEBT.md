# Technical Debt Backlog

Every item here was **intentionally deferred**, not accidentally missed — see [DECISIONS.md#adr-010](./DECISIONS.md#adr-010-technical-debt-was-intentionally-deferred-not-accidentally-accumulated) for why that distinction matters. Each entry explains why it was postponed, so a future contributor can judge whether that reason still holds before picking it up. Organized by priority; within each priority, grouped by area.

Cross-references: [ROADMAP.md](./ROADMAP.md) for which future phase each item is likely to belong to, [ARCHITECTURE.md](./ARCHITECTURE.md) for how the current system works, [PROJECT_STATUS.md](./PROJECT_STATUS.md) for the current-state summary these items feed into.

---

## High Priority

Items that block production readiness or represent an active security gap.

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
- **CSRF protection.** Phase 6 introduced the session cookie this item was waiting on, so its precondition has now occurred. `SameSite=Lax` already blocks the classic cross-site-fetch vector against the one write route (`POST /api/applications`), so this is not an actively exploitable gap today — but dedicated CSRF tokens were never part of Phase 6's approved scope and remain a real defense-in-depth opportunity, worth picking up alongside the next phase that adds write endpoints.
- **SIWE message field validation.** `POST /api/auth/verify` checks the signed message's nonce and recovers the signer address from the signature, but never re-validates the domain, URI, or chain-id fields embedded in the message itself. This matches the actual approved Phase 6 design, which only ever specified nonce + signature checking, so it is not a regression — but it is a narrow hardening opportunity: without this check, a message signed for this app could in principle be replayed against it from a different context that also renders a "Nano Task Marketplace"-labeled sign-in prompt. Identified during the Phase 6 Step 10 security audit.

### Performance

- **React Query optimization** — no prefetching and no optimistic updates exist anywhere (e.g., applying doesn't optimistically show the application in My Tasks before the server confirms it). Deferred as a polish item once the core read/write paths were working correctly.

### Testing

- **Integration tests** for the service layer (the functions that actually call Drizzle) and **API route tests** for every Route Handler. Deferred alongside the broader lack of a test suite noted under High Priority — these are the next layer up once a testing framework decision is made.
- **A committed Playwright end-to-end suite.** Ironically, extensive Playwright verification happened *during* Phase 5 development — including a synthetic EIP-6963 wallet provider built to test multi-wallet isolation — but every script was written to a temporary scratch location and deleted after use, not preserved as a repeatable suite.

### Documentation

- **A deployment guide.** Nothing currently documents how to actually ship this application to a hosting provider (environment variable setup in that provider, database branch strategy, etc.). Deferred because the project has not yet been deployed anywhere beyond local development.

---

## Low Priority

Cosmetic, cleanup, or genuinely optional items — real, but with no functional or security impact.

### Database queries

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
- **Cancel-vs-retry write-skew window.** `cancelTask` and `markPayoutRetrying` (see [Resolved → Payments](#payments)) each check the other's table before committing, but under Postgres's default READ COMMITTED isolation this narrows the race between cancelling a task and retrying its payout rather than eliminating it: two independent conditional `UPDATE`s that only read (never lock) each other's table can still both commit if their snapshots are taken before either has committed. Measured directly at roughly 4% under an aggressive, back-to-back concurrency stress test with no natural spacing between the two operations; real usage's actual network round-trip latency between two separate HTTP requests makes the practical window far narrower. Deferred because closing it fully needs explicit `SELECT ... FOR UPDATE` row locking (with carefully consistent lock ordering across both functions to avoid deadlock) or `SERIALIZABLE` isolation with retry-on-conflict logic — neither pattern is used anywhere else in this codebase today, and this is Arc Testnet-only with no production traffic. See `markPayoutRetrying`'s own doc comment in `services/payouts/payoutsService.ts` for the full detail.

### Documentation

- **A formal API specification** (e.g. OpenAPI/Swagger) beyond the plain-language route table in [ARCHITECTURE.md](./ARCHITECTURE.md#api-architecture).
- **A `CONTRIBUTING.md`.** No formal contribution process exists yet — noted as a placeholder in the project [README](../README.md#contributing).

---

## Resolved

Items that were tracked here as active debt and have since been closed out. Kept for historical record rather than deleted — see [DECISIONS.md#adr-010](./DECISIONS.md#adr-010-technical-debt-was-intentionally-deferred-not-accidentally-accumulated) for why this backlog preserves resolved items.

### Authentication

- **SIWE (Sign-In With Ethereum) implementation.** Wallet address was previously a client-supplied claim with no signature check. Originally deferred because Phase 5's scope was explicitly "identity only" — see [DECISIONS.md#adr-005](./DECISIONS.md#adr-005-wallet-first-identity). **Resolved (Phase 6):** `POST /api/auth/nonce`, `POST /api/auth/verify`, `GET /api/auth/session`, and `POST /api/auth/logout` now implement the full EIP-4361 flow — nonce issuance, wagmi message signing, server-side signature recovery via viem's `recoverMessageAddress`, and a real `sessions`-table-backed cookie session.
- **Remove `walletAddress` from client request bodies/query params as the trust boundary.** `POST /api/applications` previously accepted `walletAddress` directly in the JSON body; every `GET` route previously accepted `?wallet=` with no verification. Originally deferred alongside SIWE, since the fix *is* replacing the trust boundary. **Resolved (Phase 6):** a repository-wide audit (Step 10) confirmed zero remaining `?wallet=` usages anywhere in application code, and `getUserByWallet`/`getOrCreateUserByWallet` are now called from exactly one place — the nonce route, at the moment a claim is first made.
- **Protect API routes behind session validation.** All five routes were previously open to anyone who could guess or observe a wallet address. Originally deferred until sessions existed to protect them with. **Resolved (Phase 6):** `/api/applications`, `/api/notifications`, `/api/earnings`, `/api/profile`, and `/api/settings` all now resolve identity exclusively via `getSessionUser()` against the session cookie, returning 401 without a valid session. Verified with two isolated test wallets confirming no cross-user data leakage and forged `?wallet=` parameters having no effect, across all five routes.

### Payments

- **Automatic payout generation.** Every `payouts` row previously existed only from manual test seeding, with nothing in the application creating one. Originally excluded from Phase 5 ("Do not add Circle payout functionality yet" was stated directly in the Earnings migration's scope). **Resolved (Phase 7):** approving an application (`POST /api/tasks/[taskId]/applicants/[applicationId]/approve`) now creates a real `payouts` row via `approveApplication()`, and releasing it (`POST .../payout`) submits a real `transferFrom(creator, worker, amount)` transaction through `lib/arc/payoutRelay.ts`, independently re-verified against Arc's own RPC receipt before being marked complete. Phase 10 Workstream A added a second, Circle-managed signing path (`lib/circle/`) alongside this original raw-key path, selected via `PAYOUT_CUSTODY_MODE` — both remain testnet-only.
- **Transaction lifecycle tracking.** `payouts.tx_hash` previously existed in the schema but nothing populated or read it. **Resolved (Phase 7):** the payout route now writes the real on-chain transaction hash to `payouts.tx_hash` via `markPayoutCompleted`/`markPayoutFailed` once a payout attempt resolves, in either custody mode.
- **Retry a failed payout.** A creator could previously only decline (revoke approval for) an application whose payout failed — there was no way to retry the same payout instead, with no in-app path back to `pending`. Deliberately excluded from the Phase 10 post-approval-decline fix, which was scoped narrowly to the decline path. **Resolved (Phase 10):** `POST .../retry-payout` (a separate endpoint, task-creator-only) atomically transitions a failed payout `failed` → `retrying` → `completed` (or back to `failed`), guarded by a conditional `UPDATE ... WHERE status = 'failed'` so double-clicks, open tabs, or simultaneous requests can only ever let one attempt through. A payout that already carries a `tx_hash` from a prior attempt is independently re-verified against Arc Testnet via `verifyPayoutTransaction` before ever resubmitting — a confirmed prior success is reconciled without a second transaction, a confirmed revert proceeds to retry, and anything undetermined refuses rather than guesses. Making this safe also surfaced and closed a related gap: `cancelTask`'s atomic guard did not originally recognize `'retrying'` as an active payout state, so a task could be cancelled while a retry was in flight. `cancelTask` (`services/marketplace/mockTasks.ts`) and `markPayoutRetrying` (`services/payouts/payoutsService.ts`) now each check the other's table before committing, so whichever operation commits first is what the other correctly loses against — see the [Low Priority security item](#security-1) below for the narrow residual race this still leaves.

### Applications

- **Approval / rejection / completion workflow.** `applications.status` previously could only ever become `'applied'` through the app itself; `'approved'`, `'rejected'`, and `'completed'` existed only because they were manually seeded for testing. Originally deferred pending a product decision on who may approve an application. **Resolved (Phase 7):** the task creator — and only the task creator — can now approve or reject an application (`POST .../approve`, `POST .../reject`), each guarded so it only applies to an application still in the `'applied'` state; releasing a payout transitions the application to `'completed'` via `markApplicationCompleted()`.
- **Post-approval decline** (the limitation flagged in [LEGAL_REVIEW_CHECKLIST.md](./LEGAL_REVIEW_CHECKLIST.md#11-the-existing-post-approval-decline-limitation)). Originally, once an application was approved there was no path back to `'rejected'` — an approval could not be declined after the fact for any reason, including a payout that had failed with no other recourse. **Resolved (Phase 10):** `POST .../revoke-approval` (a separate endpoint from `/reject`, task-creator-only) transitions an approved application back to `'rejected'` and its payout to a new `payout_status` value, `'cancelled'`, but only while that payout has not already completed. The guard is a conditional `UPDATE ... WHERE status IN ('pending', 'failed')` on the payout row, evaluated at write time inside the same transaction as the application-status change — not a separate check-then-write — so this can never win a race against a payout that has already, or concurrently, completed; a `409` is returned and nothing is changed in that case. Retrying a failed payout (as opposed to declining it) was resolved separately — see [Payments above](#payments).

### Database

- **Secondary indexes on foreign-key columns used in wallet-scoped joins.** `applications.applicant_id`, `payouts.application_id`, and `notifications.user_id` had no covering index, so every wallet-scoped join relied on Postgres sequentially scanning the whole table — invisible at test-fixture data volume, but a real latency risk once realistic data volume existed. Originally deferred because index tuning against realistic data volume wasn't yet possible to validate meaningfully. **Resolved (Phase 9):** all three now have covering indexes — `applications_applicant_id_idx`, `payouts_application_unique` (a unique index, which also serves this purpose), and `notifications_user_id_idx` — confirmed directly in `db/schema.ts`.
