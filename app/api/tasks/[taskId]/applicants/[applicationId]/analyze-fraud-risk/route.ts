import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getTaskById, getTaskForFunding } from "@/services/marketplace/mockTasks";
import { getApplicationForApproval } from "@/services/applications/applicationsService";
import { getSubmissionForApplication } from "@/services/submissions/submissionsService";
import {
  anySignalTriggered,
  computeFraudSignals,
  recordAssessment,
} from "@/services/fraud/fraudSignalsService";
import { analyzeFraudRisk, FraudAnalysisError } from "@/lib/ai/analyzeFraudRisk";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";
import { log } from "@/lib/log";

const NO_SIGNALS_EXPLANATION =
  "No fraud signals were detected for this submission.";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string; applicationId: string }> }
) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const sessionUser = await getSessionUser(sessionId);
  if (!sessionUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const rateLimitResult = checkRateLimit(
    `applicants:analyzeFraudRisk:${sessionUser.id}`,
    RATE_LIMITS.applicationAnalyzeFraudRisk
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  const { taskId, applicationId } = await params;

  // Every value used below comes from these database lookups, the same
  // ownership pattern as the evaluate route: a client cannot forge
  // creatorId, and a worker can never trigger this for their own
  // submission unless they are also literally the task's creator (the
  // separate, already-known "creator applying to own task" backlog item --
  // which is itself exactly what fraud signal #1 exists to catch).
  const task = await getTaskForFunding(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (task.creatorId !== sessionUser.id) {
    return NextResponse.json(
      {
        error: "Only the task creator can run a fraud-risk analysis for this task.",
      },
      { status: 403 }
    );
  }

  const application = await getApplicationForApproval(applicationId);
  if (!application || application.taskId !== taskId) {
    return NextResponse.json(
      { error: "Application not found for this task." },
      { status: 404 }
    );
  }

  const submission = await getSubmissionForApplication(applicationId);
  if (!submission) {
    return NextResponse.json(
      { error: "No submission exists for this application yet." },
      { status: 409 }
    );
  }

  const taskDetails = await getTaskById(taskId);
  if (!taskDetails) {
    // Should be unreachable -- getTaskForFunding above already confirmed
    // the task exists.
    log.error("analyze_fraud_risk_task_details_missing", { taskId, applicationId });
    return NextResponse.json(
      { error: "Failed to load task details." },
      { status: 500 }
    );
  }

  // Advisory only: this route never writes to applications or payouts.
  // The creator's own approve/payout decisions remain entirely separate,
  // made through their existing, completely unmodified routes, regardless
  // of what this returns. Workers can never reach this route (creator-only
  // above) and are never shown its results (applicationsService only
  // surfaces fraud_assessments through getApplicantsForTask, the
  // creator-facing query -- never through getMyTasks).
  const signals = await computeFraudSignals({
    applicationId,
    taskCreatorId: task.creatorId,
    submissionId: submission.id,
    submissionContent: submission.content,
    submittedAt: submission.submittedAt,
  });

  if (!anySignalTriggered(signals)) {
    // Nothing to synthesize -- record "low" directly without spending a
    // Claude call. See analyzeFraudRisk.ts's doc comment.
    const assessment = await recordAssessment(
      applicationId,
      "low",
      NO_SIGNALS_EXPLANATION,
      signals
    );
    return NextResponse.json(
      { id: assessment.id, riskLevel: "low", explanation: NO_SIGNALS_EXPLANATION },
      { status: 200 }
    );
  }

  const startedAt = Date.now();
  try {
    const result = await analyzeFraudRisk(taskDetails.title, signals);
    const assessment = await recordAssessment(
      applicationId,
      result.riskLevel,
      result.explanation,
      signals
    );
    log.info("analyze_fraud_risk_succeeded", {
      applicationId,
      riskLevel: result.riskLevel,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { id: assessment.id, riskLevel: result.riskLevel, explanation: result.explanation },
      { status: 200 }
    );
  } catch (err) {
    log.error("analyze_fraud_risk_failed", {
      applicationId,
      durationMs: Date.now() - startedAt,
      errorType: err instanceof FraudAnalysisError ? "FraudAnalysisError" : "unexpected",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to analyze fraud risk. Please try again." },
      { status: 502 }
    );
  }
}
