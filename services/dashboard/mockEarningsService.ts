import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { applications, payouts, tasks } from "@/db/schema";
import { formatDate } from "@/lib/utils/date";
import type { EarningsSummary, Payout } from "@/types/dashboard";

export async function getEarningsSummary(
  userId: string
): Promise<EarningsSummary> {
  const [row] = await db
    .select({
      // Phase 10 fix: previously summed every payout row regardless of
      // status, so a pending, failed, or cancelled amount would silently
      // inflate this total. Only a completed payout represents money the
      // worker actually received -- matches availableBalanceUsdc's own
      // filter exactly (the two are computed identically today, since this
      // app has no separate "withdraw" step: a completed payout already
      // sent funds directly to the worker's own wallet).
      totalEarningsUsdc: sql<string>`coalesce(sum(${payouts.amountUsdc}) filter (where ${payouts.status} = 'completed'), 0)`,
      availableBalanceUsdc: sql<string>`coalesce(sum(${payouts.amountUsdc}) filter (where ${payouts.status} = 'completed'), 0)`,
      pendingPayoutsUsdc: sql<string>`coalesce(sum(${payouts.amountUsdc}) filter (where ${payouts.status} = 'pending'), 0)`,
      completedPayoutsCount: sql<string>`count(*) filter (where ${payouts.status} = 'completed')`,
    })
    .from(payouts)
    .innerJoin(applications, eq(payouts.applicationId, applications.id))
    .where(eq(applications.applicantId, userId));

  return {
    totalEarningsUsdc: Number(row.totalEarningsUsdc),
    availableBalanceUsdc: Number(row.availableBalanceUsdc),
    pendingPayoutsUsdc: Number(row.pendingPayoutsUsdc),
    completedPayoutsCount: Number(row.completedPayoutsCount),
  };
}

export async function getPayoutHistory(userId: string): Promise<Payout[]> {
  const rows = await db
    .select({
      id: payouts.id,
      taskTitle: tasks.title,
      amountUsdc: payouts.amountUsdc,
      status: payouts.status,
      paidAt: payouts.paidAt,
      createdAt: payouts.createdAt,
    })
    .from(payouts)
    .innerJoin(applications, eq(payouts.applicationId, applications.id))
    .innerJoin(tasks, eq(applications.taskId, tasks.id))
    .where(eq(applications.applicantId, userId))
    .orderBy(desc(payouts.createdAt));

  return rows.map((row) => ({
    id: row.id,
    taskTitle: row.taskTitle,
    amountUsdc: Number(row.amountUsdc),
    status: row.status,
    date: formatDate(row.paidAt ?? row.createdAt),
  }));
}
