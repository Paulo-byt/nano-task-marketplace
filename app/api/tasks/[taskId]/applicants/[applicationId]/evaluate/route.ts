import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getTaskById, getTaskForFunding } from "@/services/marketplace/mockTasks";
import { getApplicationForApproval } from "@/services/applications/applicationsService";
import {
  getSubmissionForApplication,
  recordEvaluation,
} from "@/services/submissions/submissionsService";
import { evaluateSubmission, EvaluationError } from "@/lib/ai/evaluateSubmission";
import { createSubmissionEvaluatedNotification } from "@/services/dashboard/mockNotificationService";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";
import { log } from "@/lib/log";

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
    `applicants:evaluate:${sessionUser.id}`,
    RATE_LIMITS.applicationEvaluate
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  const { taskId, applicationId } = await params;

  // Every value used below comes from these database lookups. This route
  // never reads a request body, so there is no creatorId for a client to
  // forge. Ownership is always the task's real, database-sourced
  // creatorId compared against the session -- this is also exactly what
  // makes it structurally impossible for a worker to evaluate their own
  // submission: they can never be the task's creatorId unless they are
  // also literally its creator, the separate, already-known "creator
  // applying to own task" backlog item.
  const task = await getTaskForFunding(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (task.creatorId !== sessionUser.id) {
    return NextResponse.json(
      {
        error: "Only the task creator can evaluate a submission for this task.",
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

  // Phase 9 hardening: the UI only shows the "Evaluate with AI" button
  // while no verdict exists, but that is not enforcement -- a direct call
  // to this route had no server-side guard against re-triggering a paid
  // Claude call on an already-evaluated submission. This closes that gap;
  // it deliberately does not add a "re-evaluate" affordance anywhere.
  if (submission.evaluationVerdict) {
    return NextResponse.json(
      { error: "This submission has already been evaluated." },
      { status: 409 }
    );
  }

  const taskDetails = await getTaskById(taskId);
  if (!taskDetails) {
    // Should be unreachable -- getTaskForFunding above already confirmed
    // the task exists.
    log.error("evaluate_task_details_missing", { taskId, applicationId });
    return NextResponse.json(
      { error: "Failed to load task details." },
      { status: 500 }
    );
  }

  // Advisory only: this route never writes to applications or payouts.
  // The creator's own approve/payout decisions remain entirely separate,
  // made through their existing, completely unmodified routes, regardless
  // of what this returns.
  const startedAt = Date.now();
  try {
    const evaluation = await evaluateSubmission(
      taskDetails.title,
      taskDetails.description,
      submission.content
    );
    await recordEvaluation(submission.id, evaluation.verdict, evaluation.feedback);
    log.info("evaluate_succeeded", {
      applicationId,
      durationMs: Date.now() - startedAt,
    });

    // 11E: best-effort, never allowed to turn a successful evaluation into
    // an error response.
    try {
      await createSubmissionEvaluatedNotification(
        application.applicantId,
        taskId,
        evaluation.verdict
      );
    } catch (err) {
      log.error("evaluate_notification_failed", {
        applicationId,
        taskId,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json(evaluation, { status: 200 });
  } catch (err) {
    log.error("evaluate_failed", {
      applicationId,
      durationMs: Date.now() - startedAt,
      errorType: err instanceof EvaluationError ? "EvaluationError" : "unexpected",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to evaluate the submission. Please try again." },
      { status: 502 }
    );
  }
}
