import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { applications, payouts, submissions, tasks, users } from "@/db/schema";
import { getLatestAssessmentsForApplications } from "@/services/fraud/fraudSignalsService";
import type { MyTask } from "@/types/application";
import type { Applicant } from "@/types/postedTask";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class DuplicateApplicationError extends Error {}
export class ApplicationNotApprovableError extends Error {}
export class ApprovalNotRevocableError extends Error {}

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
 * Approves an application, closes its parent task, and creates the payout
 * row -- all in one atomic transaction, the first real use of db.transaction
 * in this codebase.
 *
 * The task-closing UPDATE (status = 'open' in the WHERE clause) runs FIRST
 * and is the operation's real safety gate against the race this function
 * exists to close: two DIFFERENT applications for the SAME task approved
 * concurrently. Those are two different application rows -- the existing
 * applications.status = 'applied' guard below, scoped to one specific
 * applicationId, was never the resource those two requests actually
 * contend over; the task row is. Gating on it first, before ever touching
 * the applications row, means Postgres's real row lock on this UPDATE
 * decides the race for real: whichever request's write reaches this row
 * first wins, and the loser's own conditional UPDATE -- re-evaluated fresh
 * against the just-committed value, never an earlier read -- matches zero
 * rows and this function throws before creating anything. This is the same
 * "gate on the truly contended resource first" idiom revokeApproval already
 * established (payout row first, application row second, see below).
 *
 * The conditional UPDATE on applications (status = 'applied') is still what
 * makes two concurrent approval attempts for the *same* application safe,
 * exactly as before; the payouts.application_id unique constraint remains a
 * second, independent guard against a duplicate payout row. The EXISTS
 * clause (Fix #11) still requires the task's fundingStatus to be 'funded' --
 * unaffected by the new task-closing step, since that step only ever writes
 * `status`, never `fundingStatus`.
 *
 * taskId is a new, explicit parameter (previously derived implicitly via
 * the EXISTS join) -- sourced from the route's own already-validated
 * `application.taskId === taskId` check, the same "route validates and
 * sources trusted values, this function trusts what it's given" boundary
 * as amountUsdc.
 *
 * The explicit `SELECT ... FOR UPDATE` immediately below (before ANY other
 * read or write) is what finally closes the cancel-vs-approve race against
 * cancelTask, which takes the identical lock on the identical row as ITS
 * own first statement. An earlier version of this function relied only on
 * the task-closing UPDATE above plus the funding-status EXISTS clause
 * below, reasoning that whichever side's write committed first would make
 * the other's conditional guard correctly match zero rows. That reasoning
 * was tested and measurably false: a 25-iteration concurrent race (
 * scripts/_lifecycle-verify.ts scenario 10d) found 3/25 (~12%) runs ending
 * in exactly the invalid combination this function exists to prevent --
 * tasks.funding_status = 'cancelled' AND applications.status = 'approved',
 * with a 'pending' payout row created. The suspected mechanism: when one
 * side's UPDATE has to wait for the other's row lock, Postgres re-checks
 * that UPDATE's own WHERE clause against the fresh row on unblock
 * (EvalPlanQual), but a subquery inside that WHERE clause reading a
 * DIFFERENT table -- cancelTask's NOT EXISTS over payouts, in particular --
 * is not guaranteed to see the other transaction's just-committed rows in
 * that recheck, only whatever was visible when the blocked statement's own
 * snapshot was taken. Two independent conditional UPDATEs that only *read*
 * each other's table, never lock it, is classic Postgres write skew.
 *
 * Locking the tasks row explicitly, first, before either side has read or
 * written anything else, removes that gap: whichever transaction's
 * SELECT ... FOR UPDATE arrives first holds the lock for its entire
 * duration, and the other blocks on that SELECT itself rather than deep
 * inside an UPDATE's WHERE-clause recheck. Once unblocked, every statement
 * that follows -- including the pre-existing task-closing UPDATE, the
 * funding-status EXISTS clause below, and cancelTask's own NOT EXISTS
 * clause -- is a fresh, ordinary statement-level read that correctly sees
 * everything the other side already committed, because a blocked FOR
 * UPDATE only returns after the blocking transaction ends. None of those
 * pre-existing conditions changed at all; the lock is a new statement
 * prepended in front of them, not a replacement for any of them.
 *
 * Re-measured after adding the lock to both functions: 0/25 invalid
 * combinations (scripts/_lifecycle-verify.ts scenario 10d), and the
 * approve-vs-approve race above remains 0/25 (scenario 6) -- exactly one
 * successful approval per task in all 25 iterations, unaffected by the new
 * lock since it was already winning that race through the same tasks row.
 */
export async function approveApplication(
  applicationId: string,
  taskId: string,
  amountUsdc: number
): Promise<ApprovalResult> {
  return db.transaction(async (tx) => {
    const [lockedTask] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .for("update");

    if (!lockedTask) {
      throw new ApplicationNotApprovableError("Task not found.");
    }

    const [closedTask] = await tx
      .update(tasks)
      .set({ status: "closed" })
      .where(and(eq(tasks.id, taskId), eq(tasks.status, "open")))
      .returning({ id: tasks.id });

    if (!closedTask) {
      throw new ApplicationNotApprovableError(
        "This task is no longer open -- another applicant may already have been approved."
      );
    }

    const [updated] = await tx
      .update(applications)
      .set({ status: "approved", approvedAt: new Date() })
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.status, "applied"),
          sql`EXISTS (
            SELECT 1 FROM ${tasks}
            WHERE ${tasks.id} = ${applications.taskId}
              AND ${tasks.fundingStatus} = 'funded'
          )`
        )
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

export interface RevokeApprovalResult {
  applicationId: string;
  payoutId: string;
}

/**
 * Revokes an approval and cancels its payout in one atomic transaction --
 * the reverse of approveApplication, following the same "two related
 * writes, one transaction" precedent that function already established.
 *
 * The payout row is updated FIRST, and its conditional UPDATE (status IN
 * ('pending', 'failed') -- not a separate check-then-write) is the
 * operation's real safety gate: a payout that is already 'completed' (or
 * already 'cancelled') simply fails to match, this function throws before
 * ever touching the application row, and the transaction rolls back
 * leaving nothing changed. This is a deliberate allow-list, not a
 * not-equal check -- Fix #8 added a fifth payout status, 'retrying' (an
 * active resubmission attempt in progress, see markPayoutRetrying in
 * payoutsService.ts), and it is intentionally never added to this OR
 * clause: a payout mid-retry must never be cancelled out from under an
 * in-flight resubmission, so the allow-list simply never matches it,
 * exactly as it already never matched 'completed'. Only once the payout is
 * genuinely cancelled
 * does the application itself move 'approved' -> 'rejected' (also
 * conditional, the same idiom as every other write in this file). Ordering
 * the payout write first, and gating the whole transaction on it, is what
 * makes this safe against a payout that is completing concurrently: Postgres
 * row-level locking under a concurrent markPayoutCompleted/markPayoutFailed
 * (payoutsService.ts) means exactly one of "this revoke" or "that payout
 * resolution" wins the race for real, and the loser's own conditional
 * UPDATE simply matches zero rows -- the database itself is the source of
 * truth at the moment of the write, never an earlier read.
 *
 * Known, unsolved limitation (deliberately not hidden): the on-chain
 * transfer in payoutRelay.ts is not part of this or any database
 * transaction. If the payout route has already submitted a real
 * transferFrom and is still waiting on its receipt when this runs, the
 * payouts row can still genuinely read 'pending' in the database even
 * though a transfer is already in flight -- this function has no way to
 * see that, and would cancel a payout that is, moments later, actually
 * going to succeed on-chain. This is the same class of gap as the
 * pre-existing crash window between a successful submission and the
 * completion-marking write (payout/route.ts's own comments already
 * acknowledge that window); this change adds one more trigger for it, not
 * a new kind of risk. See docs/TECHNICAL_DEBT.md.
 */
export async function revokeApproval(
  applicationId: string
): Promise<RevokeApprovalResult> {
  return db.transaction(async (tx) => {
    const [cancelledPayout] = await tx
      .update(payouts)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(payouts.applicationId, applicationId),
          or(eq(payouts.status, "pending"), eq(payouts.status, "failed"))
        )
      )
      .returning({ id: payouts.id });

    if (!cancelledPayout) {
      throw new ApprovalNotRevocableError(
        "This application's payout has already completed (or no longer exists) and can no longer be revoked."
      );
    }

    const [updated] = await tx
      .update(applications)
      .set({ status: "rejected" })
      .where(
        and(eq(applications.id, applicationId), eq(applications.status, "approved"))
      )
      .returning({ id: applications.id });

    if (!updated) {
      throw new ApprovalNotRevocableError(
        "Application is no longer in an approved state."
      );
    }

    return { applicationId, payoutId: cancelledPayout.id };
  });
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
