import { and, eq, isNull } from "drizzle-orm";
import { parseUnits, type Address } from "viem";
import { db } from "@/db";
import { taskTemplates, users } from "@/db/schema";
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
