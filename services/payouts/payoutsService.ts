import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, payouts, users } from "@/db/schema";

export interface PayoutForRelay {
  payoutId: string;
  payoutStatus: "pending" | "completed" | "failed" | "cancelled" | "retrying";
  workerWalletAddress: string;
  // Added for Fix #8 (retry): the retry route needs this to independently
  // re-verify a previous attempt via verifyPayoutTransaction before ever
  // submitting a new one. Existing callers that don't need it simply ignore
  // the field.
  txHash: string | null;
}

/**
 * The payout row for an application, plus the worker's wallet address (the
 * transferFrom recipient) -- joined narrowly for exactly what the relay
 * route needs. Returns undefined if no payout row exists at all, which is
 * the normal state for any application that has not been approved yet:
 * approval is what creates the payout row (see approveApplication in
 * applicationsService.ts), so "no row" here means "not approved," not an
 * error condition by itself.
 */
export async function getPayoutForApplication(
  applicationId: string
): Promise<PayoutForRelay | undefined> {
  const rows = await db
    .select({
      payoutId: payouts.id,
      payoutStatus: payouts.status,
      workerWalletAddress: users.walletAddress,
      txHash: payouts.txHash,
    })
    .from(payouts)
    .innerJoin(applications, eq(payouts.applicationId, applications.id))
    .innerJoin(users, eq(applications.applicantId, users.id))
    .where(eq(payouts.applicationId, applicationId))
    .limit(1);

  return rows[0];
}

/**
 * Atomic, conditional on the row still being in `fromStatus` -- the same
 * check-in-the-WHERE-clause pattern as markTaskFunded and
 * approveApplication elsewhere in this codebase. Only marks completed
 * (with the real, independently-verified transaction hash) if the payout
 * had not already been resolved by a concurrent request; returns false
 * without writing anything otherwise, so the caller can tell "verified but
 * lost the race" apart from "verified and recorded."
 *
 * `fromStatus` defaults to "pending" -- the original release flow in
 * payout/route.ts calls this with no third argument and is completely
 * unaffected. Fix #8 (retry) is the only caller that ever passes
 * "retrying", for the `retrying -> completed` leg of its own state machine.
 */
export async function markPayoutCompleted(
  payoutId: string,
  txHash: string,
  fromStatus: "pending" | "retrying" = "pending"
): Promise<boolean> {
  const rows = await db
    .update(payouts)
    .set({ status: "completed", txHash, paidAt: new Date() })
    .where(and(eq(payouts.id, payoutId), eq(payouts.status, fromStatus)))
    .returning({ id: payouts.id });

  return rows.length > 0;
}

/**
 * Same atomic guard for the failure path. txHash is optional and only
 * ever a real, already-mined hash (recorded when transferFrom was
 * submitted and later reverted, or verification failed against a real
 * receipt) -- never a fabricated placeholder. Left unset when submission
 * itself never produced a hash at all (e.g. the executor's RPC call
 * failed before broadcasting).
 *
 * `fromStatus` defaults to "pending" for the same reason as
 * markPayoutCompleted above -- the original release flow's four call sites
 * are unaffected; Fix #8's retry route passes "retrying" for its own
 * `retrying -> failed` leg.
 */
export async function markPayoutFailed(
  payoutId: string,
  txHash?: string,
  fromStatus: "pending" | "retrying" = "pending"
): Promise<boolean> {
  const rows = await db
    .update(payouts)
    .set({ status: "failed", ...(txHash ? { txHash } : {}) })
    .where(and(eq(payouts.id, payoutId), eq(payouts.status, fromStatus)))
    .returning({ id: payouts.id });

  return rows.length > 0;
}

/**
 * The retry flow's own entry guard, and the only place `retrying` is ever
 * written. Conditional on the row still being `failed` at the moment of
 * this exact write (not an earlier read) -- this is what makes two
 * double-clicks, two open tabs, or two simultaneous retry requests for the
 * same payout safe: only one can ever match, so only one caller ever
 * proceeds to preflight/submit a real transaction. Every other concurrent
 * caller's own call to this function matches zero rows and must stop
 * before doing anything else -- see retry-payout/route.ts.
 *
 * Deliberately excluded from revokeApproval's own conditional update (which
 * only matches 'pending' or 'failed'): once a payout is `retrying`, a
 * concurrent revoke-approval request cannot cancel it out from under an
 * in-flight resubmission attempt.
 */
export async function markPayoutRetrying(payoutId: string): Promise<boolean> {
  const rows = await db
    .update(payouts)
    .set({ status: "retrying" })
    .where(and(eq(payouts.id, payoutId), eq(payouts.status, "failed")))
    .returning({ id: payouts.id });

  return rows.length > 0;
}

/**
 * Used by the task-cancellation route as a friendly pre-check (Step 9) --
 * an already-approved worker's pending payout must block cancellation of
 * the task. This is a read-only check for a clear error message; the
 * actual race-safe guarantee is the NOT EXISTS clause inside cancelTask's
 * own atomic UPDATE in mockTasks.ts, the same "friendly pre-check plus
 * atomic final guard" split already used by the payout route.
 */
export async function hasPendingPayoutForTask(taskId: string): Promise<boolean> {
  const rows = await db
    .select({ id: payouts.id })
    .from(payouts)
    .innerJoin(applications, eq(payouts.applicationId, applications.id))
    .where(and(eq(applications.taskId, taskId), eq(payouts.status, "pending")))
    .limit(1);

  return rows.length > 0;
}
