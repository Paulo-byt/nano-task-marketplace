import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import type { Notification } from "@/types/dashboard";
import { getTaskById } from "@/services/marketplace/mockTasks";
import type { SubmissionVerdict } from "@/services/submissions/submissionsService";

// Phase 9 hardening: this list previously had no LIMIT at all, growing
// unbounded with every notification a user has ever received. 100 is a
// generous cap that changes nothing for any current, real data -- it only
// bounds the worst case going forward. A real paginated UI remains a
// separate, deferred item.
const NOTIFICATION_LIMIT = 100;

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

export async function getNotifications(
  userId: string
): Promise<Notification[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(NOTIFICATION_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    timestamp: formatRelativeTime(row.createdAt),
    type: row.type,
    isRead: row.isRead,
  }));
}

export async function createApplicationSubmittedNotification(
  userId: string,
  taskTitle: string
): Promise<void> {
  await db.insert(notifications).values({
    userId,
    title: "Application Submitted",
    description: `You applied for "${taskTitle}".`,
    type: "task",
    isRead: false,
  });
}

// 11E: every notification below resolves the task title itself from
// taskId, so every call site only ever has to pass IDs it already has in
// hand -- never a second lookup at the call site. A task that's since
// vanished (should be unreachable; nothing in this codebase deletes task
// rows) still produces a real, generic notification rather than silently
// dropping it.
async function resolveTaskTitle(taskId: string): Promise<string> {
  const task = await getTaskById(taskId);
  return task?.title ?? "a task";
}

export async function createApplicationApprovedNotification(
  userId: string,
  taskId: string
): Promise<void> {
  const title = await resolveTaskTitle(taskId);
  await db.insert(notifications).values({
    userId,
    title: "Application Approved",
    description: `Your application for "${title}" was approved.`,
    type: "task",
    isRead: false,
  });
}

export async function createApplicationRejectedNotification(
  userId: string,
  taskId: string
): Promise<void> {
  const title = await resolveTaskTitle(taskId);
  await db.insert(notifications).values({
    userId,
    title: "Application Not Approved",
    description: `Your application for "${title}" was not approved.`,
    type: "task",
    isRead: false,
  });
}

export async function createWorkSubmittedNotification(
  userId: string,
  taskId: string
): Promise<void> {
  const title = await resolveTaskTitle(taskId);
  await db.insert(notifications).values({
    userId,
    title: "Work Submitted",
    description: `You submitted work for "${title}".`,
    type: "task",
    isRead: false,
  });
}

const EVALUATION_NOTIFICATION_COPY: Record<
  SubmissionVerdict,
  { title: string; describe: (taskTitle: string) => string }
> = {
  meets_requirements: {
    title: "Submission Accepted",
    describe: (taskTitle) => `Your submission for "${taskTitle}" was accepted.`,
  },
  does_not_meet_requirements: {
    title: "Submission Rejected",
    describe: (taskTitle) => `Your submission for "${taskTitle}" was rejected.`,
  },
  partially_meets_requirements: {
    title: "Submission Under Review",
    describe: (taskTitle) =>
      `Your submission for "${taskTitle}" needs another look — additional review is required.`,
  },
};

export async function createSubmissionEvaluatedNotification(
  userId: string,
  taskId: string,
  verdict: SubmissionVerdict
): Promise<void> {
  const title = await resolveTaskTitle(taskId);
  const copy = EVALUATION_NOTIFICATION_COPY[verdict];
  await db.insert(notifications).values({
    userId,
    title: copy.title,
    description: copy.describe(title),
    type: "task",
    isRead: false,
  });
}

export async function createPayoutCompletedNotification(
  userId: string,
  taskId: string
): Promise<void> {
  const title = await resolveTaskTitle(taskId);
  await db.insert(notifications).values({
    userId,
    title: "Payout Complete",
    description: `Your payout for "${title}" is complete.`,
    type: "payment",
    isRead: false,
  });
}

// Creator-facing: fired for creator-owned tasks only -- a platform-owned
// task's "creator" is the platform sentinel account, which has no session
// and no one reading its notifications.
export async function createNewApplicationNotification(
  creatorUserId: string,
  taskId: string
): Promise<void> {
  const title = await resolveTaskTitle(taskId);
  await db.insert(notifications).values({
    userId: creatorUserId,
    title: "New Application",
    description: `Someone applied to "${title}".`,
    type: "task",
    isRead: false,
  });
}

// Creator-facing: fired for creator-owned tasks only, mirroring
// createNewApplicationNotification's own reasoning -- a platform-owned
// task's submissions are evaluated automatically, with no human creator
// who would ever need "go review this" in their notification feed.
export async function createSubmissionReadyForReviewNotification(
  creatorUserId: string,
  taskId: string
): Promise<void> {
  const title = await resolveTaskTitle(taskId);
  await db.insert(notifications).values({
    userId: creatorUserId,
    title: "Submission Ready for Review",
    description: `A submission for "${title}" is ready for your review.`,
    type: "task",
    isRead: false,
  });
}

export async function createTaskCompletedNotification(
  creatorUserId: string,
  taskId: string
): Promise<void> {
  const title = await resolveTaskTitle(taskId);
  await db.insert(notifications).values({
    userId: creatorUserId,
    title: "Task Completed",
    description: `Your task "${title}" was completed and paid out.`,
    type: "task",
    isRead: false,
  });
}

/**
 * Idempotent by construction: re-marking an already-read notification
 * simply sets is_read = true again, a no-op UPDATE. Scoped to userId in
 * the WHERE clause itself (not just checked separately) so a request for
 * another user's notification id matches zero rows rather than ever
 * touching a row it doesn't own.
 */
export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });

  return result.length > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
}
