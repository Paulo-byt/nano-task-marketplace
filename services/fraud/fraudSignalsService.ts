import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { applications, fraudAssessments, submissions, users } from "@/db/schema";

export type FraudRiskLevel = "low" | "medium" | "high";

// ---------------------------------------------------------------------------
// V1 fraud-signal thresholds.
//
// IMPORTANT: these are conservative starting heuristics for a brand-new
// product with no historical usage data yet -- engineering judgment calls,
// NOT statistically calibrated fraud thresholds. Each is deliberately set
// to catch only extreme, implausible-for-genuine-human-behavior cases
// rather than to serve as a general quality bar. Revisit and recalibrate
// every one of these once real usage data exists.
// ---------------------------------------------------------------------------

/** Minimum plausible time for a human to read a task and produce any
 * genuine response at all, even the simplest possible task. */
const RAPID_APPROVAL_TO_SUBMISSION_SECONDS = 60;

const APPLICATION_VELOCITY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
/** More than this many applications in the window substantially exceeds
 * what manually reading and clicking "Apply" on distinct tasks could
 * plausibly produce. */
const APPLICATION_VELOCITY_THRESHOLD = 10;

const SUBMISSION_VELOCITY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
/** Lower than the application-velocity threshold because each submission
 * requires having already been individually approved for a distinct task
 * first -- a rarer, more gated action than applying. */
const SUBMISSION_VELOCITY_THRESHOLD = 5;

/** A single failed evaluation could be one honest mismatch; a second
 * starts to suggest a pattern rather than an isolated incident. */
const REPEATED_FAILED_EVALUATIONS_THRESHOLD = 2;

const NEW_ACCOUNT_AGE_HOURS = 24;
/** Account age under NEW_ACCOUNT_AGE_HOURS AND lifetime applications above
 * this threshold is the shape associated with rapid sybil/bot onboarding;
 * genuine users typically ramp up more gradually. */
const NEW_ACCOUNT_APPLICATION_THRESHOLD = 5;

export interface FraudSignals {
  selfApplication: { triggered: boolean };
  rapidApprovalToSubmission: { triggered: boolean; secondsElapsed: number | null };
  applicationVelocity: { triggered: boolean; countLastHour: number };
  submissionVelocity: { triggered: boolean; countLastHour: number };
  duplicateSubmissionContent: { triggered: boolean; matchCount: number };
  repeatedFailedEvaluations: { triggered: boolean; failedCount: number };
  newAccountHighActivity: {
    triggered: boolean;
    accountAgeHours: number;
    lifetimeApplicationCount: number;
  };
}

/**
 * Computes all seven v1 fraud signals for one application's submission.
 * Deliberately self-contained (its own queries, not a reuse of
 * applicationsService's functions) so this module stays isolated and does
 * not risk changing behavior shared with the approve/reject/payout paths.
 *
 * Callers must already have verified authorization and that a submission
 * exists (the same query-here/authorize-at-the-route split as every other
 * service function in this codebase).
 */
export async function computeFraudSignals(params: {
  applicationId: string;
  taskCreatorId: string;
  submissionId: string;
  submissionContent: string;
  submittedAt: Date;
}): Promise<FraudSignals> {
  const { applicationId, taskCreatorId, submissionId, submissionContent, submittedAt } =
    params;

  const [application] = await db
    .select({
      applicantId: applications.applicantId,
      approvedAt: applications.approvedAt,
    })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!application) {
    throw new Error(
      `Application ${applicationId} not found while computing fraud signals.`
    );
  }

  const { applicantId, approvedAt } = application;

  const [applicant] = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, applicantId))
    .limit(1);

  if (!applicant) {
    throw new Error(
      `User ${applicantId} not found while computing fraud signals.`
    );
  }

  const now = new Date();
  const trimmedContent = submissionContent.trim();

  // 1. Self-application -- unambiguous, no threshold.
  const selfApplication = { triggered: taskCreatorId === applicantId };

  // 2. Rapid approval -> submission. Scoped to this leg only (not
  // apply -> approve, which is the creator's decision speed, out of
  // scope for a worker-side signal).
  const secondsElapsed = approvedAt
    ? Math.max(0, (submittedAt.getTime() - approvedAt.getTime()) / 1000)
    : null;
  const rapidApprovalToSubmission = {
    triggered:
      secondsElapsed !== null && secondsElapsed < RAPID_APPROVAL_TO_SUBMISSION_SECONDS,
    secondsElapsed,
  };

  // 3. Application velocity.
  const applicationWindowStart = new Date(now.getTime() - APPLICATION_VELOCITY_WINDOW_MS);
  const [applicationVelocityRow] = await db
    .select({ value: sql<string>`count(*)` })
    .from(applications)
    .where(
      and(
        eq(applications.applicantId, applicantId),
        gte(applications.appliedAt, applicationWindowStart)
      )
    );
  const applicationCountLastHour = Number(applicationVelocityRow.value);
  const applicationVelocity = {
    triggered: applicationCountLastHour > APPLICATION_VELOCITY_THRESHOLD,
    countLastHour: applicationCountLastHour,
  };

  // 4. Submission velocity.
  const submissionWindowStart = new Date(now.getTime() - SUBMISSION_VELOCITY_WINDOW_MS);
  const [submissionVelocityRow] = await db
    .select({ value: sql<string>`count(*)` })
    .from(submissions)
    .innerJoin(applications, eq(submissions.applicationId, applications.id))
    .where(
      and(
        eq(applications.applicantId, applicantId),
        gte(submissions.submittedAt, submissionWindowStart)
      )
    );
  const submissionCountLastHour = Number(submissionVelocityRow.value);
  const submissionVelocity = {
    triggered: submissionCountLastHour > SUBMISSION_VELOCITY_THRESHOLD,
    countLastHour: submissionCountLastHour,
  };

  // 5. Exact duplicate submission content, same worker only, trimmed
  // compare, explicitly not semantic/cross-wallet.
  const [duplicateRow] = await db
    .select({ value: sql<string>`count(*)` })
    .from(submissions)
    .innerJoin(applications, eq(submissions.applicationId, applications.id))
    .where(
      and(
        eq(applications.applicantId, applicantId),
        ne(submissions.id, submissionId),
        sql`trim(${submissions.content}) = ${trimmedContent}`
      )
    );
  const duplicateMatchCount = Number(duplicateRow.value);
  const duplicateSubmissionContent = {
    triggered: duplicateMatchCount > 0,
    matchCount: duplicateMatchCount,
  };

  // 6. Repeated failed evaluations.
  const [failedEvalRow] = await db
    .select({ value: sql<string>`count(*)` })
    .from(submissions)
    .innerJoin(applications, eq(submissions.applicationId, applications.id))
    .where(
      and(
        eq(applications.applicantId, applicantId),
        eq(submissions.evaluationVerdict, "does_not_meet_requirements")
      )
    );
  const failedEvaluationCount = Number(failedEvalRow.value);
  const repeatedFailedEvaluations = {
    triggered: failedEvaluationCount >= REPEATED_FAILED_EVALUATIONS_THRESHOLD,
    failedCount: failedEvaluationCount,
  };

  // 7. New account + high lifetime activity.
  const accountAgeHours = (now.getTime() - applicant.createdAt.getTime()) / 3_600_000;
  const [lifetimeAppsRow] = await db
    .select({ value: sql<string>`count(*)` })
    .from(applications)
    .where(eq(applications.applicantId, applicantId));
  const lifetimeApplicationCount = Number(lifetimeAppsRow.value);
  const newAccountHighActivity = {
    triggered:
      accountAgeHours < NEW_ACCOUNT_AGE_HOURS &&
      lifetimeApplicationCount > NEW_ACCOUNT_APPLICATION_THRESHOLD,
    accountAgeHours,
    lifetimeApplicationCount,
  };

  return {
    selfApplication,
    rapidApprovalToSubmission,
    applicationVelocity,
    submissionVelocity,
    duplicateSubmissionContent,
    repeatedFailedEvaluations,
    newAccountHighActivity,
  };
}

export function anySignalTriggered(signals: FraudSignals): boolean {
  return Object.values(signals).some((signal) => signal.triggered);
}

/**
 * Phase M5 (Arc Testnet path): a deterministic riskLevel from these same
 * signals, with no Anthropic call -- analyzeFraudRisk.ts remains completely
 * untouched and available for a future mainnet path; this is a separate,
 * rule-based substitute for the testnet decision flow specifically, not a
 * rewrite of that file.
 *
 * Mirrors the exact policy already written into analyzeFraudRisk.ts's own
 * system prompt, made deterministic instead of left for Claude to
 * synthesize: "self-application... is the one unambiguous signal... a
 * reasonable basis for a high risk level" and "a single triggered signal
 * alone should usually NOT produce a high risk level... reserve high for
 * self-application, or a combination of multiple simultaneously triggered
 * signals." This is not a new fraud policy -- it is the existing one,
 * executed as fixed rules instead of an LLM call.
 *
 * selfApplication can never actually trigger for a platform-owned task
 * (its creator is always the platform sentinel account, never a real
 * applicant's own id) -- handled here anyway, for defense-in-depth and so
 * this function is equally correct if ever reused for a creator-task
 * context in the future.
 */
export function computeDeterministicRiskLevel(signals: FraudSignals): FraudRiskLevel {
  if (signals.selfApplication.triggered) {
    return "high";
  }

  const otherTriggeredCount = [
    signals.rapidApprovalToSubmission,
    signals.applicationVelocity,
    signals.submissionVelocity,
    signals.duplicateSubmissionContent,
    signals.repeatedFailedEvaluations,
    signals.newAccountHighActivity,
  ].filter((signal) => signal.triggered).length;

  if (otherTriggeredCount === 0) return "low";
  if (otherTriggeredCount === 1) return "medium";
  return "high";
}

/**
 * Persists one analysis run. Never overwrites a prior row -- multiple
 * assessments per application are allowed by design, each a snapshot of
 * that run's inputs and outcome. Nothing here writes to applications or
 * payouts; the creator's approve/payout decisions remain entirely separate.
 */
export async function recordAssessment(
  applicationId: string,
  riskLevel: FraudRiskLevel,
  explanation: string,
  signals: FraudSignals
): Promise<{ id: string }> {
  const [assessment] = await db
    .insert(fraudAssessments)
    .values({
      applicationId,
      riskLevel,
      explanation,
      signalsSnapshot: signals,
    })
    .returning({ id: fraudAssessments.id });

  return assessment;
}

export interface LatestFraudAssessment {
  riskLevel: FraudRiskLevel;
  explanation: string;
  analyzedAt: Date;
}

/**
 * Latest fraud_assessments row per application, for a set of a task's
 * applications. fraud_assessments is deliberately 1:many (unlike
 * payouts/submissions), so unlike getApplicantsForTask's other joins this
 * can't be a plain LEFT JOIN without duplicating applicant rows -- fetch
 * every assessment for these applications and keep only the most recent
 * per application in JS, the same correctness-over-cleverness choice
 * already made for the Dashboard Overview recent-activity feed.
 */
export async function getLatestAssessmentsForApplications(
  applicationIds: string[]
): Promise<Map<string, LatestFraudAssessment>> {
  if (applicationIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      applicationId: fraudAssessments.applicationId,
      riskLevel: fraudAssessments.riskLevel,
      explanation: fraudAssessments.explanation,
      analyzedAt: fraudAssessments.analyzedAt,
    })
    .from(fraudAssessments)
    .where(inArray(fraudAssessments.applicationId, applicationIds))
    .orderBy(desc(fraudAssessments.analyzedAt));

  const latest = new Map<string, LatestFraudAssessment>();
  for (const row of rows) {
    if (!latest.has(row.applicationId)) {
      latest.set(row.applicationId, {
        riskLevel: row.riskLevel,
        explanation: row.explanation,
        analyzedAt: row.analyzedAt,
      });
    }
  }
  return latest;
}
