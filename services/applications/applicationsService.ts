import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, tasks, users } from "@/db/schema";
import type { MyTask } from "@/types/application";
import type { Applicant } from "@/types/postedTask";

export class DuplicateApplicationError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  // Drizzle wraps the underlying Postgres error (which carries `.code`) in
  // a `.cause` chain rather than exposing it on the top-level error.
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: unknown }).code === "23505"
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export async function createApplication(taskId: string, applicantId: string) {
  try {
    const [application] = await db
      .insert(applications)
      .values({ taskId, applicantId })
      .returning();

    return application;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateApplicationError("Already applied to this task.");
    }
    throw err;
  }
}

export async function getMyTasks(applicantId: string): Promise<MyTask[]> {
  const rows = await db
    .select({
      applicationId: applications.id,
      taskId: tasks.id,
      taskTitle: tasks.title,
      rewardUsdc: tasks.rewardUsdc,
      status: applications.status,
      appliedAt: applications.appliedAt,
    })
    .from(applications)
    .innerJoin(tasks, eq(applications.taskId, tasks.id))
    .where(eq(applications.applicantId, applicantId))
    .orderBy(desc(applications.appliedAt));

  return rows.map((row) => ({
    applicationId: row.applicationId,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    rewardUsdc: Number(row.rewardUsdc),
    status: row.status,
    appliedAt: formatDate(row.appliedAt),
  }));
}

/**
 * Applicants for a single task. Ownership of that task is not checked
 * here -- the caller (the applicants route handler) must already have
 * verified the requesting session user is the task's creator before
 * calling this, the same division of responsibility as every other
 * service function in this codebase (query here, authorize at the route).
 */
export async function getApplicantsForTask(
  taskId: string
): Promise<Applicant[]> {
  const rows = await db
    .select({
      applicationId: applications.id,
      applicantDisplayName: users.displayName,
      applicantWalletAddress: users.walletAddress,
      status: applications.status,
      appliedAt: applications.appliedAt,
    })
    .from(applications)
    .innerJoin(users, eq(applications.applicantId, users.id))
    .where(eq(applications.taskId, taskId))
    .orderBy(desc(applications.appliedAt));

  return rows.map((row) => ({
    applicationId: row.applicationId,
    applicant: row.applicantDisplayName ?? row.applicantWalletAddress,
    status: row.status,
    appliedAt: formatDate(row.appliedAt),
  }));
}
