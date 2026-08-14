import { and, asc, eq, exists, isNull, sql } from "drizzle-orm";
import { parseUnits, type Address } from "viem";
import { db } from "@/db";
import {
  payloadItems,
  payloadSources,
  taskTemplates,
  taskTemplateGenerationEvents,
  tasks,
  users,
} from "@/db/schema";
import { getOrCreateUserByWallet } from "@/services/users/walletUser";
import { getExecutorAddress } from "@/lib/arc/payoutRelay";
import { verifyApprovalTransaction } from "@/lib/arc/verifyApproval";
import { USDC_DECIMALS } from "@/lib/arc/tokens";
import type { Task } from "@/types/task";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Deliberately duplicated from app/api/tasks/route.ts rather than shared --
// the same precedent lib/ai/generateTask.ts already established for these
// exact bounds ("this now makes a third instance of. Left alone on purpose
// for this step"). This is a fourth. Still left alone, for the same reason.
const ALLOWED_CATEGORIES = ["Writing", "AI", "Research", "Design", "Social"] as const;
const ALLOWED_DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"] as const;
const MIN_REWARD_USDC = 0.01;
const MAX_REWARD_USDC = 5.0;

export class InvalidTemplateInputError extends Error {}
export class PlatformAccountMisconfiguredError extends Error {}

/**
 * Phase B (never-ending platform task supply) sentinel identity -- the EVM
 * null address. No private key can ever produce it, so it can never
 * collide with a real connected wallet, and it reads unambiguously as "not
 * a real account" in any explorer or tooling.
 *
 * This is NOT the platform treasury. It cannot sign, cannot fund, and must
 * never appear in any funding, payout, or on-chain operation.
 * syncPlatformTreasuryAddress (below) is what replaces it with the real,
 * provisioned treasury wallet address once one exists -- a plain UPDATE on
 * this user's walletAddress, no schema change required. Until that has run,
 * fundTemplatePool refuses to proceed at all: every platform template
 * created against this placeholder is correctly unfundable, and nothing
 * may generate a funded instance against it.
 *
 * Only ever used as a lookup key by getOrCreatePlatformUser's bootstrap
 * path, below -- once PLATFORM_ACCOUNT_ID is set, this constant is not
 * consulted for resolution at all, only compared against for the
 * defensive checks in fundTemplatePool/syncPlatformTreasuryAddress.
 */
export const PLATFORM_ACCOUNT_WALLET_ADDRESS =
  "0x0000000000000000000000000000000000000000";

/**
 * Resolves the platform's own sentinel user row.
 *
 * Two resolution paths, deliberately different, because walletAddress is
 * NOT a stable lookup key across this account's whole lifetime --
 * syncPlatformTreasuryAddress changes it, on purpose, from the zero-address
 * placeholder above to the real treasury address once one exists. A plain
 * wallet-address lookup that worked before that change silently stops
 * finding the row afterward and creates a duplicate instead -- this is not
 * a hypothetical, it was reproduced directly by this phase's own
 * concurrency verification before being fixed here.
 *
 *   - PLATFORM_ACCOUNT_ID set (the normal case after the very first
 *     bootstrap): a plain primary-key lookup, immune to any future wallet
 *     address change. If the id is set but no matching row exists, that is
 *     a real configuration error -- fail loudly rather than silently
 *     creating a second, different "platform account" no other code would
 *     ever find again.
 *   - PLATFORM_ACCOUNT_ID unset (the very first call in a fresh
 *     environment): falls back to find-or-create by the zero-address
 *     placeholder, via getOrCreateUserByWallet exactly as written -- the
 *     same idempotent, race-safe get-or-create already proven for every
 *     real connected wallet. This path is only safe to rely on BEFORE
 *     syncPlatformTreasuryAddress has ever run: that function refuses to
 *     proceed until PLATFORM_ACCOUNT_ID is set (see below), specifically
 *     so the sequence that caused the original bug -- address changed,
 *     id still unpinned -- cannot be reached.
 *
 * displayName is filled in on the bootstrap path only, once: a raw zero
 * address is a poor "creator" label for a tasker to see on a
 * platform-generated task. The conditional UPDATE (guarded on IS NULL, not
 * a separate check-then-write) makes two concurrent first calls safe the
 * same way every other write in this codebase is.
 */
export async function getOrCreatePlatformUser() {
  const pinnedId = process.env.PLATFORM_ACCOUNT_ID;

  if (pinnedId) {
    const [row] = await db.select().from(users).where(eq(users.id, pinnedId)).limit(1);
    if (!row) {
      throw new PlatformAccountMisconfiguredError(
        `PLATFORM_ACCOUNT_ID is set to "${pinnedId}", but no user with that id ` +
          "exists. It must exactly match the id returned the first time " +
          "getOrCreatePlatformUser ran, before PLATFORM_ACCOUNT_ID was set."
      );
    }
    return row;
  }

  const platformUser = await getOrCreateUserByWallet(PLATFORM_ACCOUNT_WALLET_ADDRESS);

  if (platformUser.displayName !== null) {
    return platformUser;
  }

  const [updated] = await db
    .update(users)
    .set({ displayName: "Nano Task Marketplace" })
    .where(and(eq(users.id, platformUser.id), isNull(users.displayName)))
    .returning();

  return updated ?? platformUser;
}

export interface CreatePlatformTemplateInput {
  title: string;
  description: string;
  category: Task["category"];
  difficulty: Task["difficulty"];
  estimatedTime: string;
  rewardUsdc: number;
}

/**
 * Creates a platform-owned task template. creatorId is deliberately not a
 * parameter -- there is no caller-supplied value here to misuse, no
 * session lookup, no path from an arbitrary authenticated request into
 * this function at all, because no route calls it yet. The platform
 * account is resolved internally and used unconditionally. That, not a
 * convention someone has to remember, is what keeps this feature separate
 * from the existing public flow (POST /api/tasks -> createTask in
 * mockTasks.ts).
 *
 * Unlike createTask, which trusts its caller and leaves all validation to
 * its route, this function validates its own input, using the same bounds
 * app/api/tasks/route.ts already enforces: there is no route in front of
 * this yet, so this is currently the only gate that exists. A future admin
 * route may add its own checks; this function must never assume one will
 * already have run.
 *
 * status, poolTotalUsdc, poolAllocatedUsdc, and poolFundingTxHash are
 * deliberately left unset, taking their schema defaults ('active', 0, 0,
 * null). Funding a template's pool is Phase C's job and must never be
 * reachable from template creation -- the same separation createTask
 * already enforces between creating a task and funding one.
 */
export async function createPlatformTemplate(input: CreatePlatformTemplateInput) {
  const title = input.title.trim();
  const description = input.description.trim();
  const estimatedTime = input.estimatedTime.trim();

  if (!title || !description || !estimatedTime) {
    throw new InvalidTemplateInputError(
      "title, description, and estimatedTime are required."
    );
  }

  if (!(ALLOWED_CATEGORIES as readonly string[]).includes(input.category)) {
    throw new InvalidTemplateInputError(
      `category must be one of: ${ALLOWED_CATEGORIES.join(", ")}.`
    );
  }

  if (!(ALLOWED_DIFFICULTIES as readonly string[]).includes(input.difficulty)) {
    throw new InvalidTemplateInputError(
      `difficulty must be one of: ${ALLOWED_DIFFICULTIES.join(", ")}.`
    );
  }

  if (
    !Number.isFinite(input.rewardUsdc) ||
    input.rewardUsdc < MIN_REWARD_USDC ||
    input.rewardUsdc > MAX_REWARD_USDC
  ) {
    throw new InvalidTemplateInputError(
      `rewardUsdc must be between ${MIN_REWARD_USDC} and ${MAX_REWARD_USDC}.`
    );
  }

  const platformUser = await getOrCreatePlatformUser();

  const [template] = await db
    .insert(taskTemplates)
    .values({
      creatorId: platformUser.id,
      title,
      description,
      category: input.category,
      difficulty: input.difficulty,
      estimatedTime,
      rewardUsdc: input.rewardUsdc.toFixed(2),
    })
    .returning();

  return template;
}

/**
 * Raw lookup by id, mirroring getTaskById's own shape in mockTasks.ts
 * (UUID pre-check before ever touching the database). No ownership check
 * here -- there is no caller yet; whatever calls this in a later phase is
 * responsible for authorization, the same division of responsibility as
 * every other service function in this codebase.
 */
export async function getTemplateById(id: string) {
  if (!UUID_RE.test(id)) {
    return undefined;
  }

  const rows = await db
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.id, id))
    .limit(1);

  return rows[0];
}

// ---------------------------------------------------------------------------
// Phase C: platform treasury / pool funding mechanics. No route calls any
// of this yet -- there is no admin/operator authentication in this
// codebase to gate one, and inventing one is explicitly out of this
// phase's scope. Everything below is an internal service primitive.
// ---------------------------------------------------------------------------

export class TreasuryNotConfiguredError extends Error {}
export class PoolFundingVerificationError extends Error {}
export class DuplicateFundingTxHashError extends Error {}
export class PoolFundingAccountingError extends Error {}

// Drizzle wraps the underlying Postgres error (which carries `.code`) in a
// `.cause` chain rather than exposing it on the top-level error -- the same
// walk applicationsService.ts's own isUniqueViolation already does.
// Duplicated locally rather than importing that (unexported) helper, the
// same precedent this file's validation constants already established.
function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (
      typeof current === "object" &&
      "code" in current &&
      typeof (current as { code?: unknown }).code === "string"
    ) {
      return (current as { code: string }).code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === "23505";
}

function isCheckViolation(err: unknown): boolean {
  return pgErrorCode(err) === "23514";
}

/**
 * Connects the platform sentinel user's walletAddress to the real,
 * provisioned Circle treasury wallet -- the one operation that makes
 * fundTemplatePool below (and, eventually, every unmodified payout
 * function that resolves creatorWallet via tasks.creatorId ->
 * users.walletAddress) work correctly for platform-funded tasks, with zero
 * code changes to any of them. Must be run once, after
 * scripts/circle-provision-testnet-treasury-wallet.ts has produced a real
 * wallet id and CIRCLE_TREASURY_WALLET_ID is set.
 *
 * The zero-address equality check is defensive, not expected to ever
 * trigger -- Circle would never hand back the null address as a real
 * wallet's address -- but checked explicitly rather than assumed, the same
 * "never trust one layer" convention the provisioning scripts already use.
 *
 * lib/circle/treasuryWallet.ts is imported lazily here, not at this file's
 * top level -- the same reason getExecutorAddress in payoutRelay.ts lazily
 * imports its own Circle module rather than statically: treasuryWallet.ts
 * transitively imports lib/circle/client.ts, which throws at module-load
 * time if CIRCLE_ENTITY_SECRET is unset. A static top-level import here
 * would force every function in this file -- including createPlatformTemplate
 * and getOrCreatePlatformUser, neither of which touch Circle at all -- to
 * become unimportable in any environment without full Circle configuration.
 * Confirmed the hard way: an earlier version of this function did import it
 * statically, and it broke exactly this way under real verification.
 *
 * Requires PLATFORM_ACCOUNT_ID to already be set, checked first, before any
 * other work -- this is the fix for the bug getOrCreatePlatformUser's own
 * doc comment describes: this function is precisely the one that changes
 * the sentinel's walletAddress away from the value its bootstrap lookup
 * depends on, so pinning the id first is what keeps that account
 * resolvable afterward, for every caller, forever. Refusing here rather
 * than silently falling back to the wallet-address bootstrap path is
 * deliberate -- that fallback is exactly what produced a duplicate account
 * during this phase's own verification.
 */
export async function syncPlatformTreasuryAddress(): Promise<{ address: Address }> {
  if (!process.env.PLATFORM_ACCOUNT_ID) {
    throw new PlatformAccountMisconfiguredError(
      "PLATFORM_ACCOUNT_ID is not set. Call getOrCreatePlatformUser() once, " +
        "copy the returned id into .env.local as PLATFORM_ACCOUNT_ID, and only " +
        "then call this function -- pinning the id first is what keeps the " +
        "platform account resolvable after this function moves its wallet " +
        "address away from the bootstrap placeholder."
    );
  }

  const { getTreasuryAddress } = await import("@/lib/circle/treasuryWallet");
  const treasuryAddress = await getTreasuryAddress();

  if (treasuryAddress.toLowerCase() === PLATFORM_ACCOUNT_WALLET_ADDRESS) {
    throw new TreasuryNotConfiguredError(
      "Resolved treasury address is the zero address -- refusing to use it."
    );
  }

  const platformUser = await getOrCreatePlatformUser();

  const [updated] = await db
    .update(users)
    .set({ walletAddress: treasuryAddress.toLowerCase() })
    .where(eq(users.id, platformUser.id))
    .returning();

  return { address: updated.walletAddress as Address };
}

/**
 * The pure accounting write: records an ALREADY-VERIFIED funding amount
 * against a template's pool. Mirrors markTaskFunded's own shape and trust
 * boundary exactly (mockTasks.ts) -- this function never itself calls
 * verifyApprovalTransaction or touches the chain; the caller (
 * fundTemplatePool below, today; a future admin route's own verify-then-
 * record split, later) is responsible for verifying first. Kept separate
 * so the accounting/idempotency/concurrency behavior can be exercised and
 * proven directly, independent of network access to Arc Testnet or Circle.
 *
 * pool_total_usdc is SET to amountUsdc, never incremented -- approve()
 * itself overwrites the on-chain allowance rather than adding to it, so
 * this function's job is to record what the verified transaction actually
 * set, not to guess at an additive delta. A later, legitimate replenishment
 * (a new, different txHash, verified separately) simply calls this again
 * and overwrites both columns to the newly-verified values -- there is no
 * WHERE clause gating on the row's prior state, because there is nothing
 * about an old, superseded allowance worth preserving once a new one has
 * been independently verified.
 *
 * poolAllocatedUsdc is never touched here -- funding and allocation are
 * different operations (Phase C funds; Phase D, not yet built, allocates),
 * the same separation createTask/markTaskFunded already keep between
 * creating a task and funding one.
 *
 * Two failure modes, both already caught by existing 0008 schema, not new
 * application logic:
 *   - a unique violation on pool_funding_tx_hash means this exact
 *     transaction is already recorded as a DIFFERENT template's current
 *     funding -- rejected. Recording the SAME transaction again for the
 *     SAME template is not a conflict at all (a row can't collide with its
 *     own value), so a legitimate retry of an already-succeeded call is a
 *     harmless no-op, never blocked.
 *   - a check violation on task_templates_pool_allocation_check means the
 *     newly-verified total would be lower than what's already allocated to
 *     generated instances -- an operationally nonsensical replenishment,
 *     correctly refused by the database itself, not silently accepted.
 */
export async function recordPoolFunding(
  templateId: string,
  txHash: string,
  amountUsdc: number
): Promise<boolean> {
  try {
    const rows = await db
      .update(taskTemplates)
      .set({
        poolTotalUsdc: amountUsdc.toFixed(2),
        poolFundingTxHash: txHash,
        updatedAt: new Date(),
      })
      .where(eq(taskTemplates.id, templateId))
      .returning({ id: taskTemplates.id });

    return rows.length > 0;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateFundingTxHashError(
        "This transaction has already been used to fund a different template's pool."
      );
    }
    if (isCheckViolation(err)) {
      throw new PoolFundingAccountingError(
        "This funding amount is lower than what is already allocated to generated instances for this template."
      );
    }
    throw err;
  }
}

/**
 * Orchestrates platform pool funding end to end: resolves the platform
 * treasury and executor addresses, independently verifies the claimed
 * approve() transaction via the existing, unmodified
 * verifyApprovalTransaction (owner=treasury, spender=executor,
 * amount=amountUsdc -- the identical decode/compare logic the creator
 * funding route already trusts), and only then records it via
 * recordPoolFunding. A transaction hash alone is never treated as proof of
 * funding -- exactly the same posture app/api/tasks/[taskId]/fund/route.ts
 * already takes for a single task, reused here rather than duplicated.
 *
 * Refuses outright, before any on-chain call, if the platform sentinel
 * user's walletAddress is still the Phase B zero-address placeholder --
 * the zero address must never be treated as a valid funding wallet -- or
 * if it happens to equal the executor's own address (defense in depth: the
 * executor must never become the treasury, checked at runtime here, not
 * just documented).
 *
 * No route calls this yet. It exists as an internal primitive a future,
 * properly-authenticated admin action can call.
 */
export async function fundTemplatePool(
  templateId: string,
  txHash: string,
  amountUsdc: number
): Promise<boolean> {
  const platformUser = await getOrCreatePlatformUser();

  if (platformUser.walletAddress === PLATFORM_ACCOUNT_WALLET_ADDRESS) {
    throw new TreasuryNotConfiguredError(
      "The platform treasury has not been configured yet -- the sentinel " +
        "account still uses the zero-address placeholder. Run " +
        "syncPlatformTreasuryAddress() after provisioning the real treasury " +
        "wallet before funding any pool."
    );
  }

  const executorAddress = await getExecutorAddress();

  if (platformUser.walletAddress.toLowerCase() === executorAddress.toLowerCase()) {
    throw new TreasuryNotConfiguredError(
      "The platform treasury address must not equal the executor address -- " +
        "the executor is a delegated spender and must never become the treasury."
    );
  }

  const verification = await verifyApprovalTransaction({
    txHash,
    expectedOwner: platformUser.walletAddress as Address,
    expectedSpender: executorAddress,
    expectedAmount: parseUnits(amountUsdc.toFixed(2), USDC_DECIMALS),
  });

  if (!verification.ok) {
    throw new PoolFundingVerificationError(verification.reason);
  }

  return recordPoolFunding(templateId, txHash, amountUsdc);
}

// ---------------------------------------------------------------------------
// Instance generation & supply replenishment. Self-contained templates only
// -- title/description/etc. clone verbatim, no payload source is consulted.
// No route calls this directly; approve/route.ts and cancel/route.ts each
// call replenishTemplateIfNeeded as a best-effort step appended after their
// own existing, unmodified success paths, the same posture markTaskReleased
// already established at the payout routes.
// ---------------------------------------------------------------------------

/**
 * The single, global, v1 target: how many open+funded instances the
 * platform tries to keep available per template at once. Not a lifetime
 * cap, not a treasury figure -- purely a steady-state inventory goal.
 * Deliberately one constant for every template rather than a column: no
 * admin surface exists yet to set a per-template value, so a real column
 * would be configuration nobody can configure. $0.10-$0.50 typical
 * self-contained-template rewards mean a pool of $2-$10 sustains this
 * target, well within reasonable testnet funding.
 */
export const DEFAULT_TARGET_AVAILABLE = 20;

/**
 * The templateId of a specific task, or null if it has none (every
 * manually-posted task, and every task created before this phase).
 * Deliberately a new, narrow, standalone lookup rather than extending
 * getTaskForFunding in mockTasks.ts -- that function already serves the
 * approve/cancel routes today, but it lives in the same file as cancelTask
 * and markTaskReleased, and the smallest way to guarantee zero risk to
 * either is to not touch that file at all, at the cost of one extra small
 * query here instead.
 */
export async function getTaskTemplateId(taskId: string): Promise<string | null> {
  if (!UUID_RE.test(taskId)) {
    return null;
  }

  const [row] = await db
    .select({ templateId: tasks.templateId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  return row?.templateId ?? null;
}

export type GenerationOutcome =
  | "created"
  | "duplicate"
  | "insufficient_capacity"
  | "payload_exhausted";

export interface GenerationAttemptResult {
  outcome: GenerationOutcome;
  taskId: string | null;
}

/**
 * One atomic attempt to generate a single instance from a template, keyed
 * by triggerKey. Returns a result rather than throwing for its ordinary
 * outcomes -- unlike fundTemplatePool's error classes (which signal
 * genuinely exceptional, human-actionable failures), "duplicate trigger",
 * "insufficient capacity right now", and "no payload item available right
 * now" are routine, expected outcomes of an automated, best-effort
 * process; forcing callers to try/catch normal control flow would be the
 * wrong shape here.
 *
 * The exact sequence, one transaction, in this order and no other:
 *
 *   1. INSERT the generation-event row FIRST, before anything else. Its
 *      UNIQUE(template_id, trigger_key) constraint is what makes a
 *      concurrent or retried call for the SAME triggerKey a cheap,
 *      immediate rejection -- caught here as isUniqueViolation, before
 *      the pool is ever touched. Ordering this first (not last, as the
 *      naive sequence would have it) is what prevents two concurrent
 *      duplicate attempts from both reserving pool capacity before
 *      either reaches a uniqueness check: reserving first would let
 *      exactly that race double-spend the pool for one logical attempt.
 *
 *   2. UPDATE task_templates, incrementing pool_allocated_usdc by the
 *      template's OWN reward_usdc, conditional on status='active' AND
 *      the increment staying within pool_total_usdc -- one
 *      self-referential conditional UPDATE, the same safe shape already
 *      proven for markTaskFunded and the approve-vs-approve race (0/25,
 *      twice, this session). No SELECT...FOR UPDATE: this isn't the
 *      cross-table blind-read shape that required one for cancel-vs-
 *      approve. RETURNING the whole row means the fields needed to clone
 *      the instance (including payloadMode) are already in hand -- no
 *      separate read.
 *
 *      If this matches no row (paused/archived template, or genuinely
 *      insufficient headroom), the transaction still COMMITS -- with
 *      just the event row from step 1, generatedTaskId left null. That
 *      is not a partial failure to clean up; it is the schema's own
 *      intended shape for "attempted, no capacity" (see
 *      task_template_generation_events's own doc comment).
 *
 *   3. Payload gate (Phase 11C, Step 3) -- payload_sourced templates only.
 *      self_contained templates (every template before this phase, and
 *      every one created without an explicit payload_mode) skip this
 *      step entirely: no query against payload_items or payload_sources
 *      is ever issued for them, and their behavior is byte-for-byte
 *      identical to before this step.
 *
 *      For a payload_sourced template: SELECT one candidate row from
 *      payload_items (status='available', matching template_id, parent
 *      payload_sources.status='active' via EXISTS, oldest first) using
 *      FOR UPDATE SKIP LOCKED -- this is what lets N concurrent attempts
 *      each grab a DIFFERENT available item instead of blocking on each
 *      other, while still making it impossible for two attempts to walk
 *      away with the same row. The subsequent UPDATE re-checks both
 *      status='available' and the source's status='active' again,
 *      defensively -- SKIP LOCKED already prevents two attempts from
 *      racing on the SAME row, but it does NOT prevent the item's parent
 *      source from being paused in the narrow window between this
 *      transaction's SELECT and its UPDATE; the re-check is what makes
 *      that narrow race fail closed (claim rejected) rather than
 *      silently assigning from a now-paused source.
 *
 *      No candidate found, or the defensive UPDATE matches no row: this
 *      attempt has no payload item to give this task. Step 2's own
 *      pool reservation from step 2 above is released with a
 *      compensating decrement (same transaction, same row, so it nets
 *      back to the pre-attempt value with nothing else committed), and
 *      this function returns payload_exhausted. The event row from step
 *      1 still commits with generatedTaskId=null -- the same "attempted,
 *      no capacity" shape step 2's own insufficient_capacity case already
 *      established, just for a different resource.
 *
 *   4. INSERT the new tasks row using step 2's RETURNING data verbatim:
 *      status='open', fundingStatus='funded' (set directly -- the pool
 *      was already independently verified when funded, there is no
 *      per-instance approval to wait for), fundingTxHash=null (NEVER the
 *      template's pool_funding_tx_hash -- that would collide with
 *      tasks_funding_tx_hash_unique the moment a second instance were
 *      generated from the same pool), fundedAmountUsdc=the reward
 *      (informational, matches what a manually-funded task shows;
 *      nothing reads it for correctness -- payout uses tasks.rewardUsdc),
 *      templateId=the template's id. For a payload_sourced template only,
 *      payloadItemId is set to the row claimed in step 3, and the claimed
 *      item's content is appended to the cloned description -- there is
 *      no richer templating/placeholder mechanism in this schema yet, so
 *      this is deliberately the simplest legible embedding, not a guess
 *      at one. self_contained templates never set payloadItemId (stays
 *      null, the schema default) and never touch payload item content.
 *
 *   5. UPDATE the step-1 event row's generatedTaskId to the new task's id.
 */
export async function generateTaskInstance(
  templateId: string,
  triggerKey: string
): Promise<GenerationAttemptResult> {
  return db.transaction(async (tx) => {
    let eventId: string;
    try {
      const [event] = await tx
        .insert(taskTemplateGenerationEvents)
        .values({ templateId, triggerKey })
        .returning({ id: taskTemplateGenerationEvents.id });
      eventId = event.id;
    } catch (err) {
      if (isUniqueViolation(err)) {
        return { outcome: "duplicate", taskId: null };
      }
      throw err;
    }

    const [reserved] = await tx
      .update(taskTemplates)
      .set({
        poolAllocatedUsdc: sql`${taskTemplates.poolAllocatedUsdc} + ${taskTemplates.rewardUsdc}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(taskTemplates.id, templateId),
          eq(taskTemplates.status, "active"),
          sql`${taskTemplates.poolAllocatedUsdc} + ${taskTemplates.rewardUsdc} <= ${taskTemplates.poolTotalUsdc}`
        )
      )
      .returning();

    if (!reserved) {
      return { outcome: "insufficient_capacity", taskId: null };
    }

    // Approved EXISTS pattern for the parent source's status, reused
    // identically for both the candidate SELECT and the defensive claim
    // UPDATE below -- a closure over `tx` so both call sites share
    // exactly one definition rather than two copies that could drift.
    const activeSourceExists = () =>
      exists(
        tx
          .select({ one: sql`1` })
          .from(payloadSources)
          .where(
            and(
              eq(payloadSources.id, payloadItems.sourceId),
              eq(payloadSources.status, "active")
            )
          )
      );

    let claimedItem: typeof payloadItems.$inferSelect | undefined;

    if (reserved.payloadMode === "payload_sourced") {
      const [candidate] = await tx
        .select({ id: payloadItems.id })
        .from(payloadItems)
        .where(
          and(
            eq(payloadItems.templateId, templateId),
            eq(payloadItems.status, "available"),
            activeSourceExists()
          )
        )
        .orderBy(asc(payloadItems.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });

      const [claimed] = candidate
        ? await tx
            .update(payloadItems)
            .set({ status: "assigned", updatedAt: new Date() })
            .where(
              and(
                eq(payloadItems.id, candidate.id),
                eq(payloadItems.status, "available"),
                activeSourceExists()
              )
            )
            .returning()
        : [];

      if (!claimed) {
        // Release step 2's reservation -- same transaction, same row, no
        // WHERE guard needed: the prior conditional UPDATE above already
        // holds this row's lock for the rest of this transaction, so
        // nothing else can have touched it since.
        await tx
          .update(taskTemplates)
          .set({
            poolAllocatedUsdc: sql`${taskTemplates.poolAllocatedUsdc} - ${taskTemplates.rewardUsdc}`,
            updatedAt: new Date(),
          })
          .where(eq(taskTemplates.id, templateId));

        return { outcome: "payload_exhausted", taskId: null };
      }

      claimedItem = claimed;
    }

    const [task] = await tx
      .insert(tasks)
      .values({
        title: reserved.title,
        description: claimedItem
          ? `${reserved.description}\n\n---\nPayload:\n${claimedItem.content}`
          : reserved.description,
        rewardUsdc: reserved.rewardUsdc,
        category: reserved.category,
        difficulty: reserved.difficulty,
        estimatedTime: reserved.estimatedTime,
        creatorId: reserved.creatorId,
        status: "open",
        fundingStatus: "funded",
        fundedAmountUsdc: reserved.rewardUsdc,
        fundedAt: new Date(),
        templateId: reserved.id,
        payloadItemId: claimedItem?.id ?? null,
      })
      .returning({ id: tasks.id });

    await tx
      .update(taskTemplateGenerationEvents)
      .set({ generatedTaskId: task.id })
      .where(eq(taskTemplateGenerationEvents.id, eventId));

    return { outcome: "created", taskId: task.id };
  });
}

export interface ReplenishmentResult {
  attempted: number;
  created: number;
  stoppedEarly: boolean;
}

/**
 * Batch-to-target, never "+1": counts this template's current open+funded
 * instances, and if that's below DEFAULT_TARGET_AVAILABLE, attempts
 * exactly (target - current) generations -- never merely one, regardless
 * of how many were just consumed. triggerTaskId is the task whose
 * approval-closure or cancellation caused this call; each attempted slot
 * gets its own trigger key (`${triggerTaskId}:${slot}`), independently
 * idempotent per the sequence in generateTaskInstance's own doc comment.
 *
 * Stops early only on "insufficient_capacity" or "payload_exhausted" -- a
 * real signal that the pool, or (Phase 11C, Step 3) the template's
 * payload supply, cannot cover another instance right now, so trying
 * further slots in the same call would be pointless. A "duplicate" result
 * for one slot does NOT stop the loop: it means that specific slot was
 * already handled (by a concurrent or earlier call), not that either
 * resource is short, so later slots are still worth attempting.
 *
 * Known, deliberately accepted v1 residual: two different tasks from the
 * SAME template closing in the same narrow window can each independently
 * read a stale "current" count before either commits, and both decide to
 * replenish -- a bounded, self-correcting overshoot past target, never a
 * safety violation (every generated instance is still individually,
 * fully, safely funded; nothing is duplicated or double-spent). Closing
 * this fully would need a template-row lock held across the whole batch;
 * deliberately not added for v1, per explicit approval, in favor of the
 * simpler shape here.
 */
export async function replenishTemplateIfNeeded(
  templateId: string,
  triggerTaskId: string
): Promise<ReplenishmentResult> {
  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.templateId, templateId),
        eq(tasks.status, "open"),
        eq(tasks.fundingStatus, "funded")
      )
    );

  const current = countRow?.n ?? 0;
  const needed = Math.max(0, DEFAULT_TARGET_AVAILABLE - current);

  let attempted = 0;
  let created = 0;
  let stoppedEarly = false;

  for (let slot = 0; slot < needed; slot++) {
    attempted++;
    const result = await generateTaskInstance(templateId, `${triggerTaskId}:${slot}`);
    if (result.outcome === "created") {
      created++;
    } else if (
      result.outcome === "insufficient_capacity" ||
      result.outcome === "payload_exhausted"
    ) {
      stoppedEarly = true;
      break;
    }
    // "duplicate" -- this exact slot was already handled; continue.
  }

  return { attempted, created, stoppedEarly };
}
