import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, payouts, users } from "@/db/schema";

export interface PayoutForRelay {
  payoutId: string;
  payoutStatus: "pending" | "completed" | "failed" | "cancelled";
  workerWalletAddress: string;
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
    })
    .from(payouts)
    .innerJoin(applications, eq(payouts.applicationId, applications.id))
    .innerJoin(users, eq(applications.applicantId, users.id))
    .where(eq(payouts.applicationId, applicationId))
    .limit(1);

  return rows[0];
}

/**
 * Atomic, conditional on the row still being pending -- the same
 * check-in-the-WHERE-clause pattern as markTaskFunded and
 * approveApplication elsewhere in this codebase. Only marks completed
 * (with the real, independently-verified transaction hash) if the payout
 * had not already been resolved by a concurrent request; returns false
 * without writing anything otherwise, so the caller can tell "verified but
 * lost the race" apart from "verified and recorded."
 */
export async function markPayoutCompleted(
  payoutId: string,
  txHash: string
): Promise<boolean> {
  const rows = await db
    .update(payouts)
    .set({ status: "completed", txHash, paidAt: new Date() })
    .where(and(eq(payouts.id, payoutId), eq(payouts.status, "pending")))
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
 */
export async function markPayoutFailed(
  payoutId: string,
  txHash?: string
): Promise<boolean> {
  const rows = await db
    .update(payouts)
    .set({ status: "failed", ...(txHash ? { txHash } : {}) })
    .where(and(eq(payouts.id, payoutId), eq(payouts.status, "pending")))
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
