import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseUnits, type Address } from "viem";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getTaskForFunding } from "@/services/marketplace/mockTasks";
import {
  getApplicationForApproval,
  markApplicationCompleted,
} from "@/services/applications/applicationsService";
import {
  getPayoutForApplication,
  markPayoutCompleted,
  markPayoutFailed,
} from "@/services/payouts/payoutsService";
import { preflightPayout, submitPayoutTransfer } from "@/lib/arc/payoutRelay";
import { evaluatePayoutReceipt } from "@/lib/arc/verifyPayout";
import { arcPublicClient } from "@/lib/arc/publicClient";
import { arcTestnet } from "@/lib/arc/chains";
import { USDC_DECIMALS } from "@/lib/arc/tokens";

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

  const { taskId, applicationId } = await params;

  // Every value used below -- creator wallet, worker wallet, reward amount
  // -- comes from these database lookups. This route never reads a
  // request body, so there is no creatorId, walletAddress, worker
  // identity, or amount for a client to forge.
  const task = await getTaskForFunding(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (task.creatorId !== sessionUser.id) {
    return NextResponse.json(
      { error: "Only the task creator can release this payout." },
      { status: 403 }
    );
  }

  if (task.fundingStatus !== "funded") {
    return NextResponse.json(
      { error: "Task must be funded before releasing a payout." },
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
        error: `Application must be approved before releasing a payout (current status: ${application.status}).`,
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

  if (payout.payoutStatus !== "pending") {
    return NextResponse.json(
      { error: `Payout is already ${payout.payoutStatus}.` },
      { status: 409 }
    );
  }

  const creatorWallet = task.creatorWalletAddress as Address;
  const workerWallet = payout.workerWalletAddress as Address;
  const amount = parseUnits(task.rewardUsdc.toFixed(2), USDC_DECIMALS);

  const preflight = await preflightPayout({ creatorWallet, workerWallet, amount });
  if (!preflight.ok) {
    return NextResponse.json({ error: preflight.reason }, { status: 409 });
  }

  // Narrow the race window immediately before the expensive on-chain
  // submission. Not a full atomic guarantee on its own -- that comes from
  // the conditional update in markPayoutCompleted/markPayoutFailed below,
  // backed by the on-chain allowance itself (a second transferFrom after
  // the first succeeds genuinely reverts for insufficient allowance) -- but
  // cheap and meaningfully reduces the odds of two real transactions being
  // submitted for a double-click or fast retry.
  const recheck = await getPayoutForApplication(applicationId);
  if (!recheck || recheck.payoutStatus !== "pending") {
    return NextResponse.json(
      { error: "Payout is no longer pending." },
      { status: 409 }
    );
  }

  let txHash: `0x${string}`;
  try {
    txHash = await submitPayoutTransfer({ creatorWallet, workerWallet, amount });
  } catch (err) {
    console.error("Failed to submit payout transfer:", err);
    await markPayoutFailed(payout.payoutId);
    return NextResponse.json(
      { error: "Failed to submit the payout transaction." },
      { status: 502 }
    );
  }

  let receipt;
  try {
    receipt = await arcPublicClient.waitForTransactionReceipt({ hash: txHash });
  } catch (err) {
    console.error(
      "Failed to obtain a receipt for payout transaction",
      txHash,
      err
    );
    await markPayoutFailed(payout.payoutId, txHash);
    return NextResponse.json(
      { error: "Could not confirm the payout transaction." },
      { status: 502 }
    );
  }

  // Belt-and-suspenders chain check, mirroring the funding route's pattern
  // -- the receipt above already came from Arc Testnet's own RPC.
  try {
    const tx = await arcPublicClient.getTransaction({ hash: txHash });
    if (tx.chainId !== undefined && tx.chainId !== arcTestnet.id) {
      await markPayoutFailed(payout.payoutId, txHash);
      return NextResponse.json(
        { error: "Transaction was submitted on the wrong chain." },
        { status: 409 }
      );
    }
  } catch {
    // Non-fatal.
  }

  // Independent verification against the transaction's actual receipt and
  // its emitted Transfer event -- never trust that a successful
  // submission alone means the payout happened as expected.
  const verification = evaluatePayoutReceipt(receipt, {
    expectedFrom: creatorWallet,
    expectedTo: workerWallet,
    expectedAmount: amount,
  });

  if (!verification.ok) {
    await markPayoutFailed(payout.payoutId, txHash);
    return NextResponse.json({ error: verification.reason }, { status: 409 });
  }

  const completed = await markPayoutCompleted(payout.payoutId, txHash);
  if (!completed) {
    // The transaction genuinely succeeded and was independently verified,
    // but a concurrent request already resolved this payout row first.
    // Nothing was double-recorded in the database, but a real transfer did
    // move funds on-chain here -- surfaced loudly rather than silently
    // dropped, since this is exactly the case an operator would need to
    // know about.
    console.error(
      `Payout ${payout.payoutId} was independently verified as successful (tx ${txHash}) but its database row was already resolved by a concurrent request.`
    );
    return NextResponse.json(
      {
        error: "Payout was already resolved by a concurrent request.",
        txHash,
      },
      { status: 409 }
    );
  }

  // The payout is now the durably-recorded, independently-verified source
  // of truth. This is bookkeeping on top of that already-successful fact --
  // if it unexpectedly loses its own atomic guard (should be unreachable;
  // nothing else ever moves an application away from "approved"), that is
  // logged loudly but must never turn an already-successful payout into an
  // HTTP failure.
  const applicationCompleted = await markApplicationCompleted(applicationId);
  if (!applicationCompleted) {
    console.error(
      `Payout ${payout.payoutId} completed successfully (tx ${txHash}) but application ${applicationId} could not be marked completed -- it was not in an "approved" state at that moment.`
    );
  }

  return NextResponse.json({ status: "completed", txHash }, { status: 200 });
}
