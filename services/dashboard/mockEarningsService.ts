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
      totalEarningsUsdc: sql<string>`coalesce(sum(${payouts.amountUsdc}), 0)`,
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
