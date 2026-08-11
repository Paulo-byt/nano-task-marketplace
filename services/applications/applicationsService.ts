import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, payouts, submissions, tasks, users } from "@/db/schema";
import { getLatestAssessmentsForApplications } from "@/services/fraud/fraudSignalsService";
import type { MyTask } from "@/types/application";
import type { Applicant } from "@/types/postedTask";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class DuplicateApplicationError extends Error {}
export class ApplicationNotApprovableError extends Error {}

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
      // LEFT join: only approved applications the worker has acted on have
      // a submission row at all -- null means "not submitted yet," not an
      // error. Evaluation fields are deliberately not selected here: the
      // worker's own view never exposes the AI verdict/feedback (Step 13
      // decision), only whether/what they submitted.
      submissionContent: submissions.content,
    })
    .from(applications)
    .innerJoin(tasks, eq(applications.taskId, tasks.id))
    .leftJoin(submissions, eq(submissions.applicationId, applications.id))
    .where(eq(applications.applicantId, applicantId))
    .orderBy(desc(applications.appliedAt));

  return rows.map((row) => ({
    applicationId: row.applicationId,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    rewardUsdc: Number(row.rewardUsdc),
    status: row.status,
    appliedAt: formatDate(row.appliedAt),
    hasSubmission: row.submissionContent !== null,
    submissionContent: row.submissionContent ?? null,
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
      // LEFT join: only approved applications have a payout row at all: a
      // null here means "not approved yet," not an error. Added for Step
      // 8, which needs to display payout state alongside application
      // status in the same list.
      payoutStatus: payouts.status,
      // LEFT join: only applications the worker has submitted work for have
      // a row here. The creator's view (unlike getMyTasks above) does
      // include the evaluation verdict/feedback -- Step 13 makes that
      // creator-only by deliberately not selecting it in getMyTasks, not by
      // hiding it here.
      submissionId: submissions.id,
      submissionContent: submissions.content,
      submittedAt: submissions.submittedAt,
      evaluationVerdict: submissions.evaluationVerdict,
      evaluationFeedback: submissions.evaluationFeedback,
    })
    .from(applications)
    .innerJoin(users, eq(applications.applicantId, users.id))
    .leftJoin(payouts, eq(payouts.applicationId, applications.id))
    .leftJoin(submissions, eq(submissions.applicationId, applications.id))
    .where(eq(applications.taskId, taskId))
    .orderBy(desc(applications.appliedAt));

  // Separate fetch, not a LEFT JOIN: fraud_assessments is deliberately
  // 1:many per application (Step 14), unlike payouts/submissions above, so
  // joining it directly would duplicate applicant rows. See
  // getLatestAssessmentsForApplications's own doc comment. Creator-only
  // data -- getMyTasks below has no equivalent call.
  const latestAssessments = await getLatestAssessmentsForApplications(
    rows.map((row) => row.applicationId)
  );

  return rows.map((row) => {
    const assessment = latestAssessments.get(row.applicationId);
    return {
      applicationId: row.applicationId,
      applicant: row.applicantDisplayName ?? row.applicantWalletAddress,
      status: row.status,
      appliedAt: formatDate(row.appliedAt),
      payoutStatus: row.payoutStatus ?? null,
      submissionId: row.submissionId ?? null,
      submissionContent: row.submissionContent ?? null,
      submittedAt: row.submittedAt ? formatDate(row.submittedAt) : null,
      evaluationVerdict: row.evaluationVerdict ?? null,
      evaluationFeedback: row.evaluationFeedback ?? null,
      fraudRiskLevel: assessment?.riskLevel ?? null,
      fraudExplanation: assessment?.explanation ?? null,
      fraudAnalyzedAt: assessment ? formatDate(assessment.analyzedAt) : null,
    };
  });
}

export interface ApplicationForApproval {
  id: string;
  taskId: string;
  applicantId: string;
  status: "applied" | "approved" | "rejected" | "completed";
}

/**
 * Raw lookup for the approval route's own checks (task match, current
 * status) -- ownership of the parent task is verified by the caller via
 * getTaskForFunding before this is ever called, the same division of
 * responsibility as getApplicantsForTask above.
 */
export async function getApplicationForApproval(
  applicationId: string
): Promise<ApplicationForApproval | undefined> {
  if (!UUID_RE.test(applicationId)) {
    return undefined;
  }

  const rows = await db
    .select({
      id: applications.id,
      taskId: applications.taskId,
      applicantId: applications.applicantId,
      status: applications.status,
    })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  return rows[0];
}

export interface ApprovalResult {
  applicationId: string;
  payoutId: string;
}

/**
 * Approves an application and creates its payout row in one atomic
 * transaction -- the first real use of db.transaction in this codebase.
 *
 * The conditional UPDATE (status = 'applied' in the WHERE clause, not a
 * separate check-then-write) is what makes two concurrent approval
 * attempts for the same application safe: only one can ever match a row,
 * so only one payout is ever created. The payouts.application_id unique
 * constraint is a second, independent guard against a duplicate payout row
 * even if that were somehow bypassed. amountUsdc must be the caller's
 * already-verified, database-sourced task reward -- this function has no
 * way to independently confirm it, the same trust boundary as every other
 * service function here (query/write here, authorize and source trusted
 * values at the route).
 */
export async function approveApplication(
  applicationId: string,
  amountUsdc: number
): Promise<ApprovalResult> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(applications)
      .set({ status: "approved", approvedAt: new Date() })
      .where(
        and(eq(applications.id, applicationId), eq(applications.status, "applied"))
      )
      .returning({ id: applications.id });

    if (!updated) {
      throw new ApplicationNotApprovableError(
        "Application is no longer in an approvable state."
      );
    }

    try {
      const [payout] = await tx
        .insert(payouts)
        .values({
          applicationId,
          amountUsdc: amountUsdc.toFixed(2),
          status: "pending",
        })
        .returning({ id: payouts.id });

      return { applicationId, payoutId: payout.id };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApplicationNotApprovableError(
          "A payout for this application already exists."
        );
      }
      throw err;
    }
  });
}

/**
 * Atomically rejects an application, guarded the same way as
 * approveApplication above (status = 'applied' in the WHERE clause, not a
 * separate check-then-write) -- so a reject racing an approve for the same
 * application can only ever let one of them win. No payout row exists yet
 * for a still-"applied" application, so there is nothing else to touch.
 */
export async function rejectApplication(applicationId: string): Promise<boolean> {
  const rows = await db
    .update(applications)
    .set({ status: "rejected" })
    .where(
      and(eq(applications.id, applicationId), eq(applications.status, "applied"))
    )
    .returning({ id: applications.id });

  return rows.length > 0;
}

/**
 * Atomically marks an application completed once its payout has genuinely
 * succeeded (Step 10) -- called only after markPayoutCompleted has already
 * won its own atomic race, so this request is uniquely the one whose
 * payout completed. Guarded on status = 'approved', the same
 * conditional-update idiom as every other write here, purely as
 * defense-in-depth: nothing else in this codebase ever moves an
 * application away from "approved" other than this call and the payout
 * that triggers it.
 */
export async function markApplicationCompleted(
  applicationId: string
): Promise<boolean> {
  const rows = await db
    .update(applications)
    .set({ status: "completed", completedAt: new Date() })
    .where(
      and(eq(applications.id, applicationId), eq(applications.status, "approved"))
    )
    .returning({ id: applications.id });

  return rows.length > 0;
}
