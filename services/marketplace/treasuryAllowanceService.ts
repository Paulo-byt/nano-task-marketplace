import { desc, eq, ne, sql } from "drizzle-orm";
import { formatUnits, parseUnits } from "viem";
import { db } from "@/db";
import { platformTreasuryAllowanceEvents, taskTemplates } from "@/db/schema";
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
export class TreasuryLedgerInconsistentError extends Error {}
export class InsufficientOnChainAllowanceError extends Error {}
export class PoolAllocationExceedsRequestedTotalError extends Error {}

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
 * deliberately not collapsed into one combined condition even though some
 * are transitively implied by the others -- the same "never trust one
 * layer" posture evaluateApprovalReceipt already takes, and it means a
 * caller gets an accurate reason even if the ledger and the chain have
 * drifted out of sync with each other:
 *
 *   1. reserved (this template's new total + every other template's
 *      existing total) must not exceed the ledger's recorded ceiling.
 *   2. the ledger's recorded ceiling must not exceed the live on-chain
 *      allowance -- if it does, the ledger is claiming more capacity than
 *      the chain actually grants, and nothing should be reserved against
 *      it until that's reconciled.
 *   3. the proposed cumulative reservation must not exceed the live
 *      on-chain allowance directly -- the real, final backstop,
 *      independent of whether checks 1-2 already cover it.
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
 * rows. The live on-chain allowance is read via a plain, gas-free RPC call
 * (viem's readContract against the existing usdcAbi) *before* the
 * transaction opens, deliberately kept outside the lock -- no code in this
 * codebase holds a database transaction open across a network call, and
 * this doesn't start.
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
  const liveAllowanceBaseUnits = await arcPublicClient.readContract({
    address: USDC_TOKEN_ADDRESS,
    abi: usdcAbi,
    functionName: "allowance",
    args: [treasuryAddress, executorAddress],
  });
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

    const approvedCeiling = Number(ledgerRow.approvedAmountUsdc);
    const proposedTotal = Number(othersReserved) + amountUsdc;

    if (proposedTotal > approvedCeiling) {
      throw new InsufficientTreasuryHeadroomError(
        `Reserving ${amountUsdc.toFixed(2)} for this template would bring total reserved ` +
          `across all templates to ${proposedTotal.toFixed(2)}, exceeding the recorded ` +
          `ceiling of ${approvedCeiling.toFixed(2)}.`
      );
    }

    if (approvedCeiling > liveAllowanceUsdc) {
      throw new TreasuryLedgerInconsistentError(
        `The recorded ceiling (${approvedCeiling.toFixed(2)}) exceeds the live on-chain ` +
          `allowance (${liveAllowanceUsdc.toFixed(2)}) -- refusing to reserve against a ` +
          `ledger that claims more capacity than the chain currently grants.`
      );
    }

    if (proposedTotal > liveAllowanceUsdc) {
      throw new InsufficientOnChainAllowanceError(
        `The proposed cumulative reservation (${proposedTotal.toFixed(2)}) exceeds the ` +
          `live on-chain allowance (${liveAllowanceUsdc.toFixed(2)}).`
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
      totalReservedUsdc: proposedTotal.toFixed(2),
      remainingHeadroomUsdc: (approvedCeiling - proposedTotal).toFixed(2),
    };
  });
}
