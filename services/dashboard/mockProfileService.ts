import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { applications, users } from "@/db/schema";
import type { ProfileOverview } from "@/types/dashboard";

function formatMemberSince(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export async function getProfileStats(userId: string): Promise<ProfileOverview> {
  const [user] = await db
    .select({
      createdAt: users.createdAt,
      reputationScore: users.reputationScore,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [counts] = await db
    .select({
      tasksCompleted: sql<string>`count(*) filter (where ${applications.status} = 'completed')`,
      tasksInProgress: sql<string>`count(*) filter (where ${applications.status} in ('applied', 'approved'))`,
    })
    .from(applications)
    .where(eq(applications.applicantId, userId));

  return {
    memberSince: formatMemberSince(user.createdAt),
    tasksCompleted: Number(counts.tasksCompleted),
    tasksInProgress: Number(counts.tasksInProgress),
    reputationScore: user.reputationScore,
  };
}
