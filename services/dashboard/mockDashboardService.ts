import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { applications, payouts, tasks } from "@/db/schema";
import { getEarningsSummary } from "@/services/dashboard/mockEarningsService";
import type { ActivityItem, DashboardSummary } from "@/types/dashboard";

const RECENT_ACTIVITY_LIMIT = 5;

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * appliedTasks/completedTasks/pendingTasks are counted directly from
 * applications.status ("pending" means approved but not yet completed --
 * only meaningful now that Step 10 gives "approved" and "completed"
 * genuinely distinct meanings). totalEarningsUsdc is not recomputed here --
 * it reuses getEarningsSummary's existing figure so this page can never
 * disagree with the Earnings page, the same reuse /api/profile already
 * relies on. That field is already known to sum every payout regardless of
 * status (see TECHNICAL_DEBT.md); reproduced here deliberately, not fixed.
 */
export async function getDashboardSummary(
  userId: string
): Promise<DashboardSummary> {
  const [countsRows, earnings] = await Promise.all([
    db
      .select({
        appliedTasks: sql<string>`count(*) filter (where ${applications.status} = 'applied')`,
        completedTasks: sql<string>`count(*) filter (where ${applications.status} = 'completed')`,
        pendingTasks: sql<string>`count(*) filter (where ${applications.status} = 'approved')`,
      })
      .from(applications)
      .where(eq(applications.applicantId, userId)),
    getEarningsSummary(userId),
  ]);
  const counts = countsRows[0];

  return {
    appliedTasks: Number(counts.appliedTasks),
    completedTasks: Number(counts.completedTasks),
    pendingTasks: Number(counts.pendingTasks),
    totalEarningsUsdc: earnings.totalEarningsUsdc,
  };
}

interface ActivityCandidate {
  id: string;
  type: ActivityItem["type"];
  occurredAt: Date;
  taskTitle: string;
}

const ACTIVITY_DESCRIPTIONS: Record<ActivityItem["type"], (title: string) => string> = {
  applied: (title) => `Applied for "${title}"`,
  completed: (title) => `Completed "${title}"`,
  payment: (title) => `Received payment for "${title}"`,
};

/**
 * Three small, independently ordered/limited queries merged and re-sorted
 * in JS, rather than a single SQL UNION ALL -- sidesteps needing a stable
 * cross-branch ORDER BY alias on a Drizzle set-operator result, at the cost
 * of fetching up to 3x RECENT_ACTIVITY_LIMIT candidate rows total. Fine at
 * this app's current, already-documented unpaginated/unindexed scale.
 * Worker/applicant-scoped only, matching the existing ActivityItem type
 * contract exactly -- creator-side events (funding, approving) are not
 * part of this feed.
 */
export async function getRecentActivity(userId: string): Promise<ActivityItem[]> {
  const [appliedRows, completedRows, paymentRows] = await Promise.all([
    db
      .select({ id: applications.id, occurredAt: applications.appliedAt, taskTitle: tasks.title })
      .from(applications)
      .innerJoin(tasks, eq(applications.taskId, tasks.id))
      .where(eq(applications.applicantId, userId))
      .orderBy(desc(applications.appliedAt))
      .limit(RECENT_ACTIVITY_LIMIT),
    db
      .select({ id: applications.id, occurredAt: applications.completedAt, taskTitle: tasks.title })
      .from(applications)
      .innerJoin(tasks, eq(applications.taskId, tasks.id))
      .where(
        and(eq(applications.applicantId, userId), isNotNull(applications.completedAt))
      )
      .orderBy(desc(applications.completedAt))
      .limit(RECENT_ACTIVITY_LIMIT),
    db
      .select({ id: payouts.id, occurredAt: payouts.paidAt, taskTitle: tasks.title })
      .from(payouts)
      .innerJoin(applications, eq(payouts.applicationId, applications.id))
      .innerJoin(tasks, eq(applications.taskId, tasks.id))
      .where(and(eq(applications.applicantId, userId), eq(payouts.status, "completed")))
      .orderBy(desc(payouts.paidAt))
      .limit(RECENT_ACTIVITY_LIMIT),
  ]);

  const candidates: ActivityCandidate[] = [
    ...appliedRows.map((row) => ({
      id: `applied-${row.id}`,
      type: "applied" as const,
      occurredAt: row.occurredAt,
      taskTitle: row.taskTitle,
    })),
    ...completedRows
      .filter((row) => row.occurredAt !== null)
      .map((row) => ({
        id: `completed-${row.id}`,
        type: "completed" as const,
        occurredAt: row.occurredAt as Date,
        taskTitle: row.taskTitle,
      })),
    ...paymentRows
      .filter((row) => row.occurredAt !== null)
      .map((row) => ({
        id: `payment-${row.id}`,
        type: "payment" as const,
        occurredAt: row.occurredAt as Date,
        taskTitle: row.taskTitle,
      })),
  ];

  candidates.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  return candidates.slice(0, RECENT_ACTIVITY_LIMIT).map((item) => ({
    id: item.id,
    type: item.type,
    description: ACTIVITY_DESCRIPTIONS[item.type](item.taskTitle),
    timestamp: formatRelativeTime(item.occurredAt),
  }));
}
