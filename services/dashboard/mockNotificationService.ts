import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import type { Notification } from "@/types/dashboard";

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
