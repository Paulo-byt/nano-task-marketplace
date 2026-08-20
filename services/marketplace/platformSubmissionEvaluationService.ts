import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, tasks } from "@/db/schema";
import {
  getSubmissionForApplication,
  recordEvaluation,
  type SubmissionVerdict,
} from "@/services/submissions/submissionsService";
import {
  computeFraudSignals,
  computeDeterministicRiskLevel,
  recordAssessment,
} from "@/services/fraud/fraudSignalsService";
import { TestnetDeterministicEvaluator } from "@/lib/evaluation/testnetDeterministicEvaluator";
import { isActiveTierTemplate } from "@/lib/evaluation/platformGroundTruth";
import { log } from "@/lib/log";

// Mirrors TaskDetails.tsx's own splitPayloadDescription exactly (same
// marker, same behavior for a description with no marker) -- duplicated
// rather than imported, since that function lives in a UI component and a
// service must not depend on one. Kept in sync by convention, the same
// "small, deliberate duplication" precedent already established elsewhere
// in this codebase (e.g. submissionsService.ts's own isUniqueViolation).
const PAYLOAD_SEPARATOR = "\n\n---\nPayload:\n";

function splitPayloadDescription(description: string): {
  instructions: string;
  payload: string | null;
} {
  const separatorIndex = description.indexOf(PAYLOAD_SEPARATOR);
  if (separatorIndex === -1) {
    return { instructions: description, payload: null };
  }
  const instructions = description.slice(0, separatorIndex);
  const payload = description.slice(separatorIndex + PAYLOAD_SEPARATOR.length);
  if (payload.trim().length === 0) {
    return { instructions: description, payload: null };
  }
  return { instructions, payload };
}

export type PlatformSubmissionDecision = "ACCEPTED" | "REJECTED" | "REVIEW";

export type PlatformEvaluationOutcome =
  | { status: "not_applicable"; reason: string }
  | { status: "already_evaluated" }
  | { status: "processed"; decision: PlatformSubmissionDecision };

/**
 * Phase M5 orchestration: the ONLY place that decides ACCEPTED/REJECTED/
 * REVIEW for a platform-owned task's submission on Arc Testnet. Never
 * throws -- every non-applicable or already-handled case is a typed
 * outcome, the same best-effort posture replenishTemplateIfNeeded and
 * replenishPayloadSupplyIfNeeded already establish for a caller (the
 * submit route) that must never let this turn a successful submission into
 * an error response.
 *
 * Idempotency: guarded explicitly on submissions.evaluatedAt being null,
 * checked fresh here (not trusted from any caller-supplied state) --
 * belt-and-suspenders alongside the structural guarantee that this is only
 * ever invoked once per submission anyway (createSubmission can only
 * succeed once per application, enforced by submissions_application_unique,
 * and the submit route only calls this after a NEW createSubmission call
 * just succeeded). A second call for an already-evaluated submission is a
 * safe, cheap no-op, never a second decision, never a second fraud
 * assessment.
 *
 * Only ever runs for platform-owned tasks (task.templateId is non-null).
 * Nothing about a creator-owned task's submission, evaluation, or fraud
 * workflow is read, written, or triggered from here -- getSessionUser,
 * evaluateSubmission, analyzeFraudRisk, and every creator-facing route
 * remain completely untouched and unaffected.
 *
 * No client-supplied value is ever trusted: applicationId is the only
 * input, and every fact used for the decision (task, template, submission
 * content, fraud signals) is re-resolved from the database inside this
 * function, never passed in.
 */
export async function evaluatePlatformSubmissionIfNeeded(
  applicationId: string
): Promise<PlatformEvaluationOutcome> {
  const [application] = await db
    .select({
      id: applications.id,
      taskId: applications.taskId,
      status: applications.status,
    })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!application) {
    return { status: "not_applicable", reason: "Application not found." };
  }

  const [task] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      creatorId: tasks.creatorId,
      templateId: tasks.templateId,
      payloadItemId: tasks.payloadItemId,
    })
    .from(tasks)
    .where(eq(tasks.id, application.taskId))
    .limit(1);

  if (!task || !task.templateId) {
    // Not a platform-generated task -- the existing creator-facing
    // evaluate/analyze-fraud-risk routes own this application's workflow
    // entirely; this function has nothing to do here.
    return { status: "not_applicable", reason: "Not a platform-owned task." };
  }

  if (application.status !== "approved") {
    // A submission can only exist for an 'approved' application in the
    // first place (submit/route.ts's own guard) -- this is defensive, not
    // an expected path.
    return { status: "not_applicable", reason: "Application is not approved." };
  }

  const submission = await getSubmissionForApplication(applicationId);
  if (!submission) {
    return { status: "not_applicable", reason: "No submission exists yet." };
  }

  if (submission.evaluatedAt !== null) {
    return { status: "already_evaluated" };
  }

  const { instructions, payload } = splitPayloadDescription(task.description);
  const isActiveTier = await isActiveTierTemplate(task.templateId);

  const evaluator = new TestnetDeterministicEvaluator();
  const evalResult = await evaluator.evaluate({
    templateId: task.templateId,
    taskTitle: task.title,
    taskDescription: instructions,
    payloadContent: payload,
    payloadItemId: task.payloadItemId,
    submissionContent: submission.content,
  });

  const signals = await computeFraudSignals({
    applicationId,
    taskCreatorId: task.creatorId,
    submissionId: submission.id,
    submissionContent: submission.content,
    submittedAt: submission.submittedAt,
  });
  const riskLevel = computeDeterministicRiskLevel(signals);

  const triggeredCount = Object.values(signals).filter((s) => s.triggered).length;
  await recordAssessment(
    applicationId,
    riskLevel,
    `Automated Arc Testnet risk assessment (deterministic, no AI call): ` +
      `${triggeredCount} of 7 signal(s) triggered; risk level "${riskLevel}".`,
    signals
  );

  let decision: PlatformSubmissionDecision;
  let verdict: SubmissionVerdict;
  let feedback: string;

  if (evalResult.outcome === "fail") {
    decision = "REJECTED";
    verdict = "does_not_meet_requirements";
    feedback = evalResult.reason;
  } else if (evalResult.outcome === "review") {
    // Unreachable for an active-tier template today (its own evaluator
    // path never returns "review" -- see testnetDeterministicEvaluator.ts's
    // own top-of-file comment) -- still reachable for a paused template's
    // already-in-flight application, whose legacy format-only evaluator is
    // untouched by the tester release.
    decision = "REVIEW";
    verdict = "partially_meets_requirements";
    feedback = evalResult.reason;
  } else if (riskLevel !== "low" && isActiveTier) {
    // Tester release (Option A): an active-tier template's submission must
    // reach a terminal PASS or FAIL, never REVIEW -- there is no human
    // reviewer for a platform-owned task to hand an elevated-risk case to.
    // Content passed its own check, but elevated fraud risk is still
    // sufficient reason to withhold reward; unlike the legacy REVIEW-
    // downgrade path below, this is a real rejection, not a hold.
    decision = "REJECTED";
    verdict = "does_not_meet_requirements";
    feedback =
      "This submission was not approved due to elevated automated risk signals on " +
      "this account or activity pattern, independent of the content itself.";
  } else if (riskLevel !== "low") {
    // Legacy (paused-template) path, unchanged: fraud policy is
    // conservative -- elevated risk never auto-rejects on its own (see
    // computeDeterministicRiskLevel's own doc comment), it only ever
    // downgrades an otherwise-accepted submission to human review.
    decision = "REVIEW";
    verdict = "partially_meets_requirements";
    feedback = `${evalResult.reason} Routed to review due to elevated automated risk signals.`;
  } else {
    decision = "ACCEPTED";
    verdict = "meets_requirements";
    feedback = evalResult.reason;
  }

  await recordEvaluation(submission.id, verdict, feedback);

  log.info("platform_submission_evaluated", {
    applicationId,
    templateId: task.templateId,
    decision,
    riskLevel,
  });

  return { status: "processed", decision };
}
