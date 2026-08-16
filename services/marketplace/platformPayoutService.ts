import { parseUnits, type Address } from "viem";
import { getTaskForFunding, markTaskReleased } from "@/services/marketplace/mockTasks";
import { getTaskTemplateId } from "@/services/marketplace/taskTemplatesService";
import {
  getApplicationForApproval,
  markApplicationCompleted,
} from "@/services/applications/applicationsService";
import { getSubmissionForApplication } from "@/services/submissions/submissionsService";
import {
  getPayoutForApplication,
  markPayoutCompleted,
  markPayoutFailed,
} from "@/services/payouts/payoutsService";
import { releasePoolAllocationForPayout } from "@/services/marketplace/treasuryAllowanceService";
import { preflightPayout, submitPayoutTransfer } from "@/lib/arc/payoutRelay";
import { evaluatePayoutReceipt } from "@/lib/arc/verifyPayout";
import { arcPublicClient } from "@/lib/arc/publicClient";
import { arcTestnet } from "@/lib/arc/chains";
import { USDC_DECIMALS } from "@/lib/arc/tokens";
import { log } from "@/lib/log";

export type PlatformPayoutOutcome =
  | "not_applicable"
  | "already_resolved"
  | "no_payout_row"
  | "preflight_failed"
  | "submission_failed"
  | "receipt_failed"
  | "verification_failed"
  | "completed";

export interface PlatformPayoutResult {
  outcome: PlatformPayoutOutcome;
  reason?: string;
  txHash?: string;
}

/**
 * Phase M6: the ONLY place that automatically pays a platform-owned task's
 * worker. This is not a reimplementation of the payout mechanism -- every
 * transaction-submitting or DB-writing step below calls the exact same,
 * completely unmodified primitives payout/route.ts (the human-triggered
 * release) already calls, in the same order, with the same failure
 * handling: preflightPayout, submitPayoutTransfer, evaluatePayoutReceipt,
 * markPayoutCompleted, markPayoutFailed, markApplicationCompleted,
 * markTaskReleased. The only genuinely new logic here is the eligibility
 * gate above them, which exists because a platform-owned task's creator is
 * the platform sentinel account -- it has no session, so it can never pass
 * payout/route.ts's own `task.creatorId === sessionUser.id` check. This
 * function is the trusted, server-side path that stands in for that check,
 * gated on facts about the application/task/submission alone, never on any
 * caller-supplied value (there is no request body here at all -- the only
 * input is applicationId, and every fact used below is re-resolved from
 * the database).
 *
 * Idempotency is inherited, not reinvented: payouts.applicationId is
 * already unique (one payout row per application, created once by
 * approveApplication and never again), and markPayoutCompleted/
 * markPayoutFailed are already atomic, conditional UPDATEs gated on the
 * row still being in the expected fromStatus. This function's own
 * responsibility is simply to call them in the right order and never
 * short-circuit past a check that would let it call submitPayoutTransfer
 * twice for the same payout.
 *
 * Never throws -- every failure mode is a typed outcome, the same
 * best-effort posture every other M4/M5 background trigger in this
 * codebase already takes toward its own caller.
 */
export async function processPlatformPayoutIfEligible(
  applicationId: string
): Promise<PlatformPayoutResult> {
  const application = await getApplicationForApproval(applicationId);
  if (!application) {
    return { outcome: "not_applicable", reason: "Application not found." };
  }

  const templateId = await getTaskTemplateId(application.taskId);
  if (!templateId) {
    return { outcome: "not_applicable", reason: "Not a platform-owned task." };
  }

  if (application.status !== "approved") {
    return { outcome: "not_applicable", reason: "Application is not approved." };
  }

  const submission = await getSubmissionForApplication(applicationId);
  if (!submission) {
    return { outcome: "not_applicable", reason: "No submission exists." };
  }

  if (submission.evaluatedAt === null) {
    return { outcome: "not_applicable", reason: "Submission has not been evaluated yet." };
  }

  if (submission.evaluationVerdict !== "meets_requirements") {
    return {
      outcome: "not_applicable",
      reason: `Evaluation verdict is "${submission.evaluationVerdict}", not "meets_requirements".`,
    };
  }

  const task = await getTaskForFunding(application.taskId);
  if (!task) {
    return { outcome: "not_applicable", reason: "Task not found." };
  }

  const payout = await getPayoutForApplication(applicationId);
  if (!payout) {
    // Should be impossible -- approveApplication always creates a payout
    // row in the same transaction that approves a platform application.
    // Surfaced loudly rather than silently ignored, the same posture
    // payout/route.ts's own identical defensive branch already takes.
    log.error("platform_payout_missing_payout_row", { applicationId });
    return { outcome: "no_payout_row", reason: "No payout record found for this application." };
  }

  if (payout.payoutStatus !== "pending") {
    // Covers "already completed" AND "already failed" AND any other
    // non-pending state -- this function never retries automatically, and
    // never re-attempts a payout a prior run already resolved either way.
    return { outcome: "already_resolved", reason: `Payout is already ${payout.payoutStatus}.` };
  }

  const creatorWallet = task.creatorWalletAddress as Address;
  const workerWallet = payout.workerWalletAddress as Address;
  const amount = parseUnits(task.rewardUsdc.toFixed(2), USDC_DECIMALS);

  const preflight = await preflightPayout({ creatorWallet, workerWallet, amount });
  if (!preflight.ok) {
    // Deliberately does NOT call markPayoutFailed -- mirrors
    // payout/route.ts exactly: a preflight failure (e.g. insufficient
    // treasury balance right now) is left as a retriable "pending" payout,
    // not moved to a more terminal "failed" state, since the underlying
    // condition can resolve on its own (e.g. once the treasury is topped
    // up) without anything about this specific payout being wrong.
    return { outcome: "preflight_failed", reason: preflight.reason };
  }

  // Narrows the race window immediately before the expensive on-chain
  // submission -- the same cheap, non-atomic-on-its-own recheck
  // payout/route.ts already performs at this exact point, for the same
  // reason (the real atomic guarantee is markPayoutCompleted/
  // markPayoutFailed's own conditional UPDATE below).
  const recheck = await getPayoutForApplication(applicationId);
  if (!recheck || recheck.payoutStatus !== "pending") {
    return { outcome: "already_resolved", reason: "Payout is no longer pending." };
  }

  let txHash: `0x${string}`;
  try {
    txHash = await submitPayoutTransfer({ creatorWallet, workerWallet, amount });
  } catch (err) {
    log.error("platform_payout_submit_failed", {
      payoutId: payout.payoutId,
      applicationId,
      message: err instanceof Error ? err.message : String(err),
    });
    await markPayoutFailed(payout.payoutId);
    return {
      outcome: "submission_failed",
      reason: "Failed to submit the payout transaction.",
    };
  }

  let receipt;
  try {
    receipt = await arcPublicClient.waitForTransactionReceipt({ hash: txHash });
  } catch (err) {
    log.error("platform_payout_receipt_failed", {
      payoutId: payout.payoutId,
      applicationId,
      txHash,
      message: err instanceof Error ? err.message : String(err),
    });
    await markPayoutFailed(payout.payoutId, txHash);
    return {
      outcome: "receipt_failed",
      reason: "Could not confirm the payout transaction.",
      txHash,
    };
  }

  try {
    const tx = await arcPublicClient.getTransaction({ hash: txHash });
    if (tx.chainId !== undefined && tx.chainId !== arcTestnet.id) {
      await markPayoutFailed(payout.payoutId, txHash);
      return {
        outcome: "verification_failed",
        reason: "Transaction was submitted on the wrong chain.",
        txHash,
      };
    }
  } catch {
    // Non-fatal, mirrors payout/route.ts.
  }

  const verification = evaluatePayoutReceipt(receipt, {
    expectedFrom: creatorWallet,
    expectedTo: workerWallet,
    expectedAmount: amount,
  });

  if (!verification.ok) {
    // A real transaction exists (txHash is real and mined) but did not
    // verify as the expected transfer -- left as "failed" WITH the hash
    // recorded, the same "requires reconciliation, never silently
    // dropped, never auto-retried" signal payout/route.ts already
    // establishes for this exact case.
    await markPayoutFailed(payout.payoutId, txHash);
    return { outcome: "verification_failed", reason: verification.reason, txHash };
  }

  const completed = await markPayoutCompleted(payout.payoutId, txHash);
  if (!completed) {
    // The transfer genuinely succeeded and was independently verified,
    // but a concurrent process already recorded this payout first. Real
    // funds moved on-chain; surfaced loudly, never silently dropped --
    // the identical posture payout/route.ts's own equivalent branch
    // already takes.
    log.error("platform_payout_resolved_by_concurrent_process", {
      payoutId: payout.payoutId,
      applicationId,
      txHash,
    });
    return {
      outcome: "already_resolved",
      reason: "Payout was already resolved by a concurrent process.",
      txHash,
    };
  }

  // Post-M6 lifecycle fix: this specific reward amount has now permanently
  // left the treasury via a real, independently-verified transferFrom --
  // it no longer needs to count as future outstanding capacity, and this
  // template's generation headroom should reflect that it can be recycled.
  // Best-effort, matching markApplicationCompleted/markTaskReleased's own
  // posture right below: the payout itself already succeeded and was
  // already verified: a failure here must never be reported as a payout
  // failure, since that would incorrectly suggest the money never moved.
  try {
    await releasePoolAllocationForPayout(templateId, task.rewardUsdc);
  } catch (err) {
    log.error("platform_payout_completed_but_pool_not_released", {
      payoutId: payout.payoutId,
      applicationId,
      templateId,
      txHash,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const applicationCompleted = await markApplicationCompleted(applicationId);
  if (!applicationCompleted) {
    log.error("platform_payout_completed_but_application_not_marked_completed", {
      payoutId: payout.payoutId,
      applicationId,
      txHash,
    });
  }

  const taskReleased = await markTaskReleased(application.taskId);
  if (!taskReleased) {
    log.error("platform_payout_completed_but_task_not_marked_released", {
      payoutId: payout.payoutId,
      applicationId,
      taskId: application.taskId,
      txHash,
    });
  }

  log.info("platform_payout_completed", {
    applicationId,
    templateId,
    payoutId: payout.payoutId,
    txHash,
  });

  return { outcome: "completed", txHash };
}
