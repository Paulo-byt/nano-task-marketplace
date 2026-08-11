import { eq } from "drizzle-orm";
import { db } from "@/db";
import { submissions } from "@/db/schema";

export class DuplicateSubmissionError extends Error {}

export type SubmissionVerdict =
  | "meets_requirements"
  | "partially_meets_requirements"
  | "does_not_meet_requirements";

export interface SubmissionRecord {
  id: string;
  applicationId: string;
  content: string;
  submittedAt: Date;
  evaluationVerdict: SubmissionVerdict | null;
  evaluationFeedback: string | null;
  evaluatedAt: Date | null;
}

function isUniqueViolation(err: unknown): boolean {
  // Duplicated from applicationsService.ts rather than shared -- see the
  // cumulative technical-debt backlog. Same reasoning as the reward-bounds
  // constants: kept local and minimal for this step rather than extracting
  // a shared helper unasked.
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

/**
 * The caller (the submit route) must already have verified the application
 * belongs to the authenticated worker and is currently "approved" before
 * calling this -- the same query-here/authorize-at-the-route split as every
 * other service function in this codebase. The submissions_application_id
 * unique index is what actually makes a duplicate submission impossible,
 * not an application-level check here.
 */
export async function createSubmission(
  applicationId: string,
  content: string
): Promise<{ id: string }> {
  try {
    const [submission] = await db
      .insert(submissions)
      .values({ applicationId, content })
      .returning({ id: submissions.id });

    return submission;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateSubmissionError(
        "A submission for this application already exists."
      );
    }
    throw err;
  }
}

export async function getSubmissionForApplication(
  applicationId: string
): Promise<SubmissionRecord | undefined> {
  const rows = await db
    .select()
    .from(submissions)
    .where(eq(submissions.applicationId, applicationId))
    .limit(1);

  return rows[0];
}

/**
 * Records Claude's verdict and feedback -- advisory only. Nothing here
 * touches applications or payouts; the creator's own approve/payout
 * decisions remain entirely separate, unaffected by whatever this writes.
 */
export async function recordEvaluation(
  submissionId: string,
  verdict: SubmissionVerdict,
  feedback: string
): Promise<boolean> {
  const rows = await db
    .update(submissions)
    .set({
      evaluationVerdict: verdict,
      evaluationFeedback: feedback,
      evaluatedAt: new Date(),
    })
    .where(eq(submissions.id, submissionId))
    .returning({ id: submissions.id });

  return rows.length > 0;
}
