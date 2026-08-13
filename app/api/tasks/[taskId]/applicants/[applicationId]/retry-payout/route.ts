import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseUnits, type Address } from "viem";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getTaskForFunding, markTaskReleased } from "@/services/marketplace/mockTasks";
import {
  getApplicationForApproval,
  markApplicationCompleted,
} from "@/services/applications/applicationsService";
import {
  getPayoutForApplication,
  markPayoutRetrying,
  markPayoutCompleted,
  markPayoutFailed,
} from "@/services/payouts/payoutsService";
import { preflightPayout, submitPayoutTransfer } from "@/lib/arc/payoutRelay";
import { evaluatePayoutReceipt, verifyPayoutTransaction } from "@/lib/arc/verifyPayout";
import { arcPublicClient } from "@/lib/arc/publicClient";
import { arcTestnet } from "@/lib/arc/chains";
import { USDC_DECIMALS } from "@/lib/arc/tokens";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";
import { log } from "@/lib/log";

// The exact, unique reason string evaluatePayoutReceipt returns only when
// receipt.status !== "success" (see lib/arc/verifyPayout.ts) -- the one
// evaluatePayoutReceipt/verifyPayoutTransaction outcome that unambiguously
// means "definitely reverted, zero funds moved." Every other {ok:false}
// reason (not found, malformed hash, wrong chain, or a real Transfer event
// that simply doesn't match the expected from/to/amount) means "cannot be
// safely ruled out," not "safe" -- so this route never resubmits for those,
// per the Fix #8 design review.
const DEFINITELY_REVERTED_REASON = "Transaction did not succeed on-chain.";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string; applicationId: string }> }
) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const sessionUser = await getSessionUser(sessionId);
  if (!sessionUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const rateLimitResult = checkRateLimit(
    `applicants:retryPayout:${sessionUser.id}`,
    RATE_LIMITS.applicationRetryPayout
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  const { taskId, applicationId } = await params;

  // Every value used below comes from these database lookups, the same
  // trust boundary as approve/reject/revoke-approval/payout -- this route
  // never reads a request body.
  const task = await getTaskForFunding(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (task.creatorId !== sessionUser.id) {
    return NextResponse.json(
      { error: "Only the task creator can retry this payout." },
      { status: 403 }
    );
  }

  // Retry is a real fund movement, exactly like the original release --
  // require the task to still be funded, closing the race against a task
  // that was cancelled after the original payout failed (revoke-approval
  // has no equivalent requirement, since cancelling doesn't move funds).
  if (task.fundingStatus !== "funded") {
    return NextResponse.json(
      { error: "Task must be funded to retry a payout." },
      { status: 409 }
    );
  }

  const application = await getApplicationForApproval(applicationId);
  if (!application || application.taskId !== taskId) {
    return NextResponse.json(
      { error: "Application not found for this task." },
      { status: 404 }
    );
  }

  if (application.status !== "approved") {
    return NextResponse.json(
      {
        error: `Application must be approved to retry a payout (current status: ${application.status}).`,
      },
      { status: 409 }
    );
  }

  const payout = await getPayoutForApplication(applicationId);
  if (!payout) {
    console.error(
      `No payout row found for approved application ${applicationId} -- this should be impossible, since approveApplication always creates one.`
    );
    return NextResponse.json(
      { error: "Payout record not found for this application." },
      { status: 500 }
    );
  }

  if (payout.payoutStatus !== "failed") {
    return NextResponse.json(
      { error: `Payout is not in a failed state (current status: ${payout.payoutStatus}).` },
      { status: 409 }
    );
  }

  const creatorWallet = task.creatorWalletAddress as Address;
  const workerWallet = payout.workerWalletAddress as Address;
  const amount = parseUnits(task.rewardUsdc.toFixed(2), USDC_DECIMALS);

  // The atomic concurrency guard -- called exactly once, before any
  // reconciliation check or on-chain submission. Only one concurrent
  // request can ever win this conditional update (WHERE status = 'failed');
  // every other double-click, open tab, or simultaneous request matches
  // zero rows here and stops immediately, never reaching preflight or a
  // real transaction submission.
  const retrying = await markPayoutRetrying(payout.payoutId);
  if (!retrying) {
    return NextResponse.json(
      { error: "Payout is no longer in a failed state." },
      { status: 409 }
    );
  }

  // Reconciliation: a payout that already has a tx_hash must never be
  // blindly resubmitted. The prior failure may have been a receipt-wait
  // timeout or a verification mismatch rather than a real on-chain revert
  // (see docs/TECHNICAL_DEBT.md and the Fix #8 design review) -- re-check
  // that exact hash against Arc Testnet directly first.
  if (payout.txHash) {
    const reconciliation = await verifyPayoutTransaction({
      txHash: payout.txHash,
      expectedFrom: creatorWallet,
      expectedTo: workerWallet,
      expectedAmount: amount,
    });

    if (reconciliation.ok) {
      // The existing transaction actually succeeded -- reconcile instead of
      // ever submitting a second transfer.
      const completed = await markPayoutCompleted(
        payout.payoutId,
        payout.txHash,
        "retrying"
      );
      if (!completed) {
        log.error("retry_reconciliation_resolved_by_concurrent_request", {
          payoutId: payout.payoutId,
          applicationId,
          txHash: payout.txHash,
        });
        return NextResponse.json(
          {
            error: "Payout was already resolved by a concurrent request.",
            txHash: payout.txHash,
          },
          { status: 409 }
        );
      }

      const applicationCompleted = await markApplicationCompleted(applicationId);
      if (!applicationCompleted) {
        log.error("retry_reconciled_but_application_not_marked_completed", {
          payoutId: payout.payoutId,
          applicationId,
          txHash: payout.txHash,
        });
      }

      const taskReleased = await markTaskReleased(taskId);
      if (!taskReleased) {
        log.error("retry_reconciled_but_task_not_marked_released", {
          payoutId: payout.payoutId,
          applicationId,
          taskId,
          txHash: payout.txHash,
        });
      }

      return NextResponse.json(
        { status: "completed", txHash: payout.txHash },
        { status: 200 }
      );
    }

    if (reconciliation.reason !== DEFINITELY_REVERTED_REASON) {
      // Cannot safely tell "still pending / not yet mined" apart from
      // "genuinely gone" from here -- refuse rather than guess. The payout
      // goes back to 'failed' (preserving the existing tx_hash) so a human,
      // or a later retry once more time has passed, can revisit it.
      log.error("retry_reconciliation_undetermined", {
        payoutId: payout.payoutId,
        applicationId,
        txHash: payout.txHash,
        reason: reconciliation.reason,
      });
      await markPayoutFailed(payout.payoutId, payout.txHash, "retrying");
      return NextResponse.json(
        {
          error:
            "Cannot safely determine the outcome of the previous payout attempt. Not retrying automatically.",
        },
        { status: 409 }
      );
    }

    // Else: definitely reverted on-chain, zero funds moved -- safe to fall
    // through and attempt a fresh submission below.
  }

  const preflight = await preflightPayout({ creatorWallet, workerWallet, amount });
  if (!preflight.ok) {
    await markPayoutFailed(payout.payoutId, payout.txHash ?? undefined, "retrying");
    return NextResponse.json({ error: preflight.reason }, { status: 409 });
  }

  let txHash: `0x${string}`;
  try {
    txHash = await submitPayoutTransfer({ creatorWallet, workerWallet, amount });
  } catch (err) {
    log.error("retry_payout_submit_failed", {
      payoutId: payout.payoutId,
      applicationId,
      message: err instanceof Error ? err.message : String(err),
    });
    await markPayoutFailed(payout.payoutId, undefined, "retrying");
    return NextResponse.json(
      { error: "Failed to submit the payout transaction." },
      { status: 502 }
    );
  }

  let receipt;
  try {
    receipt = await arcPublicClient.waitForTransactionReceipt({ hash: txHash });
  } catch (err) {
    log.error("retry_payout_receipt_failed", {
      payoutId: payout.payoutId,
      applicationId,
      txHash,
      message: err instanceof Error ? err.message : String(err),
    });
    await markPayoutFailed(payout.payoutId, txHash, "retrying");
    return NextResponse.json(
      { error: "Could not confirm the payout transaction." },
      { status: 502 }
    );
  }

  // Belt-and-suspenders chain check, mirroring the original payout route.
  try {
    const tx = await arcPublicClient.getTransaction({ hash: txHash });
    if (tx.chainId !== undefined && tx.chainId !== arcTestnet.id) {
      await markPayoutFailed(payout.payoutId, txHash, "retrying");
      return NextResponse.json(
        { error: "Transaction was submitted on the wrong chain." },
        { status: 409 }
      );
    }
  } catch {
    // Non-fatal.
  }

  const verification = evaluatePayoutReceipt(receipt, {
    expectedFrom: creatorWallet,
    expectedTo: workerWallet,
    expectedAmount: amount,
  });

  if (!verification.ok) {
    await markPayoutFailed(payout.payoutId, txHash, "retrying");
    return NextResponse.json({ error: verification.reason }, { status: 409 });
  }

  const completed = await markPayoutCompleted(payout.payoutId, txHash, "retrying");
  if (!completed) {
    // The transaction genuinely succeeded and was independently verified,
    // but a concurrent request already resolved this payout row first --
    // should be unreachable given the atomic retrying guard above, but
    // surfaced loudly rather than silently dropped, matching the original
    // payout route's own defensive handling of this case.
    log.error("retry_payout_resolved_by_concurrent_request", {
      payoutId: payout.payoutId,
      applicationId,
      txHash,
    });
    return NextResponse.json(
      {
        error: "Payout was already resolved by a concurrent request.",
        txHash,
      },
      { status: 409 }
    );
  }

  const applicationCompleted = await markApplicationCompleted(applicationId);
  if (!applicationCompleted) {
    log.error("retry_payout_completed_but_application_not_marked_completed", {
      payoutId: payout.payoutId,
      applicationId,
      txHash,
    });
  }

  const taskReleased = await markTaskReleased(taskId);
  if (!taskReleased) {
    log.error("retry_payout_completed_but_task_not_marked_released", {
      payoutId: payout.payoutId,
      applicationId,
      taskId,
      txHash,
    });
  }

  return NextResponse.json({ status: "completed", txHash }, { status: 200 });
}
