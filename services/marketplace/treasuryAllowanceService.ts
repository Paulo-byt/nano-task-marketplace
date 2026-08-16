import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { formatUnits, parseUnits } from "viem";
import { db } from "@/db";
import {
  applications,
  payouts,
  platformTreasuryAllowanceEvents,
  taskTemplates,
  tasks,
} from "@/db/schema";
import { verifyApprovalTransaction } from "@/lib/arc/verifyApproval";
import { getExecutorAddress } from "@/lib/arc/payoutRelay";
import { getTreasuryAddress } from "@/lib/circle/treasuryWallet";
import { arcPublicClient } from "@/lib/arc/publicClient";
import { usdcAbi, USDC_TOKEN_ADDRESS, USDC_DECIMALS } from "@/lib/arc/tokens";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export class InvalidTreasuryAllowanceInputError extends Error {}
export class TreasuryAllowanceVerificationError extends Error {}
export class TreasuryTemplateNotFoundError extends Error {}
export class NoTreasuryAllowanceRecordedError extends Error {}
export class InsufficientTreasuryHeadroomError extends Error {}
export class InsufficientOnChainAllowanceError extends Error {}
export class InsufficientTreasuryBalanceError extends Error {}
export class PoolAllocationExceedsRequestedTotalError extends Error {}

// Post-M6 lifecycle fix: TreasuryLedgerInconsistentError (ledgerCeiling >
// liveAllowance) has been removed. That check encoded an assumption that
// was only ever true before any real payout had happened -- approve()
// sets the ledger ceiling AND the live allowance to the same value
// simultaneously, but every real transferFrom afterward decrements the
// live allowance alone. Once M6 executed its first real payout, ceiling
// (45.00) > liveAllowance (44.80) became the permanent, expected steady
// state, not an anomaly -- so treating it as one made every subsequent
// reservation attempt fail, forever, regardless of template or amount.
// The ledger's latest row remains exactly what it always was (the most
// recently approved ceiling, an append-only historical record) -- it is
// simply no longer compared directly against the live allowance as a
// pass/fail gate. See getTotalCompletedPlatformPayoutsUsdc and
// reserveTemplatePool below for what replaced it.

// Deliberately duplicated rather than importing an unexported helper --
// the same precedent taskTemplatesService.ts's own pgErrorCode/
// isUniqueViolation already established for this exact situation.
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

/**
 * Phase M3 (multi-template shared treasury allowance), Tier 1: records a
 * verified treasury approve() as the platform's new current ceiling.
 * Mirrors fundTemplatePool's own verify-then-record shape exactly, but
 * targets platform_treasury_allowance_events instead of a single
 * task_templates row -- this transaction is no longer "for" any one
 * template, it sets the shared capacity every template's own pool
 * reservation (reserveTemplatePool, below) draws against.
 *
 * Idempotent: resubmitting the exact same, already-recorded txHash returns
 * the existing row rather than erroring -- a legitimate retry of an
 * already-succeeded call is a harmless no-op, the same posture
 * recordPoolFunding already takes for its own duplicate-hash case. A
 * resubmission that claims a DIFFERENT amount for an already-used hash is
 * a genuine anomaly and is rejected.
 */
export async function fundPlatformTreasuryAllowance(
  txHash: string,
  amountUsdc: number
) {
  if (!TX_HASH_RE.test(txHash)) {
    throw new InvalidTreasuryAllowanceInputError("Malformed transaction hash.");
  }
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    throw new InvalidTreasuryAllowanceInputError(
      "amountUsdc must be a finite, positive number."
    );
  }

  const treasuryAddress = await getTreasuryAddress();
  const executorAddress = await getExecutorAddress();

  const verification = await verifyApprovalTransaction({
    txHash,
    expectedOwner: treasuryAddress,
    expectedSpender: executorAddress,
    expectedAmount: parseUnits(amountUsdc.toFixed(2), USDC_DECIMALS),
  });

  if (!verification.ok) {
    throw new TreasuryAllowanceVerificationError(verification.reason);
  }

  try {
    const [event] = await db
      .insert(platformTreasuryAllowanceEvents)
      .values({
        approvedAmountUsdc: amountUsdc.toFixed(2),
        approvalTxHash: txHash,
      })
      .returning();

    return event;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const [existing] = await db
        .select()
        .from(platformTreasuryAllowanceEvents)
        .where(eq(platformTreasuryAllowanceEvents.approvalTxHash, txHash))
        .limit(1);

      if (existing && Number(existing.approvedAmountUsdc) === amountUsdc) {
        return existing;
      }

      throw new TreasuryAllowanceVerificationError(
        "This transaction has already been recorded with a different approved amount."
      );
    }
    throw err;
  }
}

/**
 * The latest (and therefore current) recorded ceiling -- mirrors on-chain
 * approve() semantics exactly: the most recent event fully replaces
 * whatever came before it, so "current" is always just the newest row, not
 * a sum or a running total. Returns undefined if no ceiling has ever been
 * recorded yet.
 */
export async function getCurrentTreasuryAllowance() {
  const [latest] = await db
    .select()
    .from(platformTreasuryAllowanceEvents)
    .orderBy(desc(platformTreasuryAllowanceEvents.createdAt))
    .limit(1);

  return latest;
}

/**
 * Post-M6 lifecycle fix: total USDC across every platform-task payout that
 * has actually completed -- money that has permanently left the treasury
 * via a real, verified transferFrom and will never need future allowance
 * or balance again. isNotNull(tasks.templateId) is the same
 * platform-ownership signal used everywhere else in this codebase
 * (platformPayoutService.ts's own eligibility gate, getMyApplicationForTask's
 * gating); a creator-owned task's payout is never counted here, matching
 * the fact that creator tasks have no pool/ceiling accounting at all.
 *
 * Accepts either the plain db handle or an open transaction so
 * reserveTemplatePool can read it under the same row locks as everything
 * else it checks, while getTreasuryHealthSnapshot can call it as a plain,
 * lock-free read.
 */
export async function getTotalCompletedPlatformPayoutsUsdc(
  executor: Omit<typeof db, "$client"> = db
): Promise<number> {
  const [{ total }] = await executor
    .select({
      total: sql<string>`COALESCE(SUM(${payouts.amountUsdc}), 0)`,
    })
    .from(payouts)
    .innerJoin(applications, eq(payouts.applicationId, applications.id))
    .innerJoin(tasks, eq(applications.taskId, tasks.id))
    .where(and(eq(payouts.status, "completed"), isNotNull(tasks.templateId)));

  return Number(total);
}

/**
 * Post-M6 lifecycle fix: releases one completed payout's reward amount
 * back into its template's generation headroom, called exactly once per
 * payout -- by platformPayoutService.ts, immediately after
 * markPayoutCompleted succeeds for the first time (never on a call that
 * finds the payout already resolved, which would double-release). This is
 * the other half of the fix alongside getTotalCompletedPlatformPayoutsUsdc:
 * that function corrects the *allowance/balance* side (a completed payout
 * no longer counts as a future obligation); this one corrects the
 * *generation* side, so replenishTemplateIfNeeded/generateTaskInstance
 * -- both completely unmodified -- naturally see the freed headroom
 * through their own existing poolAllocatedUsdc + rewardUsdc <=
 * poolTotalUsdc check and can generate a new instance in its place. This
 * is what makes template pools recyclable rather than a one-time,
 * permanently-exhausted budget.
 *
 * A single relative UPDATE, atomic on its own (no explicit transaction
 * needed, the same way generateTaskInstance's own poolAllocatedUsdc
 * decrement -- its compensating release on payload exhaustion -- needs
 * none beyond the outer transaction it happens to already be inside).
 * GREATEST(..., 0) is defensive, not load-bearing under correct operation:
 * each instance's reward is added to poolAllocatedUsdc exactly once (at
 * generation) and this releases it back exactly once (at payout
 * completion, gated by markPayoutCompleted's own idempotency), so the
 * running total is balanced by construction; the floor only guards
 * against an unforeseen future caller breaking that pairing.
 *
 * Best-effort by design, matching markApplicationCompleted/
 * markTaskReleased's own posture in platformPayoutService.ts: the payout
 * itself has already succeeded and been independently verified on-chain by
 * the time this runs. A failure here must never be reported as a payout
 * failure -- it would incorrectly suggest money never moved when it did.
 * The caller is responsible for catching and logging.
 */
export async function releasePoolAllocationForPayout(
  templateId: string,
  amountUsdc: number
): Promise<void> {
  await db
    .update(taskTemplates)
    .set({
      poolAllocatedUsdc: sql`GREATEST(${taskTemplates.poolAllocatedUsdc} - ${amountUsdc.toFixed(2)}::numeric, 0)`,
      updatedAt: new Date(),
    })
    .where(eq(taskTemplates.id, templateId));
}

export interface ReserveTemplatePoolResult {
  templateId: string;
  poolTotalUsdc: string;
  poolAllocatedUsdc: string;
  approvedCeilingUsdc: string;
  totalReservedUsdc: string;
  remainingHeadroomUsdc: string;
}

/**
 * Phase M3, Tier 2: sets a single template's poolTotalUsdc to amountUsdc,
 * as a pure database reservation against the shared ceiling Tier 1
 * establishes -- never submits a Circle transaction, never touches the
 * chain's write path. Mirrors recordPoolFunding's own "SET, not increment"
 * semantics for poolTotalUsdc, but reservation-funded templates keep
 * poolFundingTxHash untouched (left null, or whatever it already was) --
 * that column's UNIQUE constraint means it can no longer mean "the
 * transaction that funded this template" once one approval can back many
 * templates at once; real provenance now lives in
 * platform_treasury_allowance_events instead.
 *
 * Four independent invariant checks, each with its own rejection reason,
 * deliberately not collapsed into one combined condition -- the same
 * "never trust one layer" posture evaluateApprovalReceipt already takes.
 * Two different totals are in play, and confusing them is exactly the bug
 * this fixed (see the removed TreasuryLedgerInconsistentError, above):
 *
 *   - proposedTotalRaw = this template's new total + every other
 *     template's existing poolTotalUsdc. A pure quota-allocation figure --
 *     "how much headroom has the operator ever granted across all
 *     templates" -- independent of whether any of it has been spent yet.
 *   - proposedTotalOutstanding = proposedTotalRaw minus every completed
 *     platform payout, platform-wide (getTotalCompletedPlatformPayoutsUsdc).
 *     "How much of that headroom could still genuinely need paying in the
 *     future." A completed payout has already permanently left the
 *     treasury -- it will never need allowance or balance again, so it
 *     must not keep counting against either.
 *
 *   1. proposedTotalRaw must not exceed the ledger's recorded ceiling --
 *      an operator-approval sanity check, deliberately NOT netted against
 *      completed payouts: it answers "did the operator ever grant this
 *      much total quota," not "is any of it still outstanding." Raising
 *      this ceiling remains the existing, separate, operator-controlled
 *      POST /api/operator/treasury/allowance action.
 *   2. proposedTotalOutstanding must not exceed the live on-chain
 *      allowance -- the real, final backstop for "can this actually still
 *      be paid." (Replaces the old, removed ceiling-vs-allowance check,
 *      which was only ever valid before any real payout had happened.)
 *   3. proposedTotalOutstanding must not exceed the treasury's actual,
 *      live ERC-20 USDC balance -- allowance is a spending *permission*
 *      ceiling, not proof the treasury still holds enough real USDC; these
 *      are independent on-chain quantities that only move together
 *      *during* a payout (transferFrom decrements both atomically), never
 *      automatically kept in sync with each other ahead of time.
 *   4. this template's own poolAllocatedUsdc (already-generated instances)
 *      must not exceed the new poolTotalUsdc being requested -- the same
 *      invariant task_templates_pool_allocation_check already enforces at
 *      the database level, checked here first for a clear rejection reason
 *      instead of a raw constraint-violation error.
 *
 * All four checks, and the write itself, happen inside one db.transaction
 * with the current ledger row and the target template row both locked via
 * FOR UPDATE -- the same transactional-safety idiom generateTaskInstance
 * already proves out in this codebase, applied here to a different pair of
 * rows. Both the live on-chain allowance and the live treasury balance are
 * read via plain, gas-free RPC calls (viem's readContract against the
 * existing usdcAbi) *before* the transaction opens, deliberately kept
 * outside the lock -- no code in this codebase holds a database transaction
 * open across a network call, and this doesn't start.
 */
export async function reserveTemplatePool(
  templateId: string,
  amountUsdc: number
): Promise<ReserveTemplatePoolResult> {
  if (!UUID_RE.test(templateId)) {
    throw new TreasuryTemplateNotFoundError(
      `No task template with id "${templateId}" exists.`
    );
  }
  if (!Number.isFinite(amountUsdc) || amountUsdc < 0) {
    throw new InvalidTreasuryAllowanceInputError(
      "amountUsdc must be a finite, non-negative number."
    );
  }

  const treasuryAddress = await getTreasuryAddress();
  const executorAddress = await getExecutorAddress();
  const [liveTreasuryBalanceBaseUnits, liveAllowanceBaseUnits] = await Promise.all([
    arcPublicClient.readContract({
      address: USDC_TOKEN_ADDRESS,
      abi: usdcAbi,
      functionName: "balanceOf",
      args: [treasuryAddress],
    }),
    arcPublicClient.readContract({
      address: USDC_TOKEN_ADDRESS,
      abi: usdcAbi,
      functionName: "allowance",
      args: [treasuryAddress, executorAddress],
    }),
  ]);
  const liveTreasuryBalanceUsdc = Number(formatUnits(liveTreasuryBalanceBaseUnits, USDC_DECIMALS));
  const liveAllowanceUsdc = Number(formatUnits(liveAllowanceBaseUnits, USDC_DECIMALS));

  return db.transaction(async (tx) => {
    const [ledgerRow] = await tx
      .select()
      .from(platformTreasuryAllowanceEvents)
      .orderBy(desc(platformTreasuryAllowanceEvents.createdAt))
      .limit(1)
      .for("update");

    if (!ledgerRow) {
      throw new NoTreasuryAllowanceRecordedError(
        "No treasury allowance ceiling has been recorded yet. Fund the shared ceiling " +
          "via fundPlatformTreasuryAllowance before reserving any template pool."
      );
    }

    const [template] = await tx
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.id, templateId))
      .for("update");

    if (!template) {
      throw new TreasuryTemplateNotFoundError(
        `No task template with id "${templateId}" exists.`
      );
    }

    const [{ othersReserved }] = await tx
      .select({
        othersReserved: sql<string>`COALESCE(SUM(${taskTemplates.poolTotalUsdc}), 0)`,
      })
      .from(taskTemplates)
      .where(ne(taskTemplates.id, templateId));

    const totalCompletedPayoutsUsdc = await getTotalCompletedPlatformPayoutsUsdc(tx);

    const approvedCeiling = Number(ledgerRow.approvedAmountUsdc);
    const proposedTotalRaw = Number(othersReserved) + amountUsdc;
    const proposedTotalOutstanding = proposedTotalRaw - totalCompletedPayoutsUsdc;

    if (proposedTotalRaw > approvedCeiling) {
      throw new InsufficientTreasuryHeadroomError(
        `Reserving ${amountUsdc.toFixed(2)} for this template would bring total reserved ` +
          `across all templates to ${proposedTotalRaw.toFixed(2)}, exceeding the recorded ` +
          `ceiling of ${approvedCeiling.toFixed(2)}.`
      );
    }

    if (proposedTotalOutstanding > liveAllowanceUsdc) {
      throw new InsufficientOnChainAllowanceError(
        `The proposed outstanding reservation (${proposedTotalOutstanding.toFixed(2)}, after ` +
          `netting out ${totalCompletedPayoutsUsdc.toFixed(2)} in already-completed payouts) ` +
          `exceeds the live on-chain allowance (${liveAllowanceUsdc.toFixed(2)}).`
      );
    }

    if (proposedTotalOutstanding > liveTreasuryBalanceUsdc) {
      throw new InsufficientTreasuryBalanceError(
        `The proposed outstanding reservation (${proposedTotalOutstanding.toFixed(2)}, after ` +
          `netting out ${totalCompletedPayoutsUsdc.toFixed(2)} in already-completed payouts) ` +
          `exceeds the treasury's actual USDC balance (${liveTreasuryBalanceUsdc.toFixed(2)}) ` +
          `-- the allowance may permit this reservation, but the treasury does not hold ` +
          `enough USDC to ever pay it out.`
      );
    }

    const currentAllocated = Number(template.poolAllocatedUsdc);
    if (currentAllocated > amountUsdc) {
      throw new PoolAllocationExceedsRequestedTotalError(
        `This template already has ${currentAllocated.toFixed(2)} allocated to generated ` +
          `instances, which exceeds the requested new pool total of ${amountUsdc.toFixed(2)}.`
      );
    }

    const [updated] = await tx
      .update(taskTemplates)
      .set({ poolTotalUsdc: amountUsdc.toFixed(2), updatedAt: new Date() })
      .where(eq(taskTemplates.id, templateId))
      .returning();

    return {
      templateId: updated.id,
      poolTotalUsdc: updated.poolTotalUsdc,
      poolAllocatedUsdc: updated.poolAllocatedUsdc,
      approvedCeilingUsdc: approvedCeiling.toFixed(2),
      totalReservedUsdc: proposedTotalOutstanding.toFixed(2),
      remainingHeadroomUsdc: (approvedCeiling - proposedTotalOutstanding).toFixed(2),
    };
  });
}
