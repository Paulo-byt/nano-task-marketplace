import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getApplicationForApproval } from "@/services/applications/applicationsService";
import {
  createSubmission,
  DuplicateSubmissionError,
} from "@/services/submissions/submissionsService";
import { evaluatePlatformSubmissionIfNeeded } from "@/services/marketplace/platformSubmissionEvaluationService";
import { processPlatformPayoutIfEligible } from "@/services/marketplace/platformPayoutService";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";
import { log } from "@/lib/log";

const MAX_CONTENT_LENGTH = 5000;

function extractContent(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("content" in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>).content;
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

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
    `applicants:submit:${sessionUser.id}`,
    RATE_LIMITS.applicationSubmit
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  const { taskId, applicationId } = await params;

  // Every value used below comes from this database lookup. This route
  // never reads applicantId from the request body, so there is nothing for
  // a client to forge -- ownership is always the application's real,
  // database-sourced applicantId compared against the session.
  const application = await getApplicationForApproval(applicationId);
  if (!application || application.taskId !== taskId) {
    return NextResponse.json(
      { error: "Application not found for this task." },
      { status: 404 }
    );
  }

  if (application.applicantId !== sessionUser.id) {
    return NextResponse.json(
      {
        error:
          "Only the applicant who owns this application can submit work for it.",
      },
      { status: 403 }
    );
  }

  if (application.status !== "approved") {
    return NextResponse.json(
      {
        error: `Application must be approved before submitting work (current status: ${application.status}).`,
      },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const content = extractContent(body);
  if (!content) {
    return NextResponse.json(
      { error: "content is required and cannot be empty." },
      { status: 400 }
    );
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      { error: `content must be ${MAX_CONTENT_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  try {
    const submission = await createSubmission(applicationId, content);

    // M5: best-effort, synchronous -- the deterministic testnet evaluator
    // makes no network call (no Anthropic, no other provider), so there is
    // no reason to defer this to a background job the way an AI- or
    // Circle-backed step would need to be. A no-op for every creator-owned
    // task (evaluatePlatformSubmissionIfNeeded's own first check) and never
    // allowed to turn a successful submission into an error response --
    // the same posture every other best-effort step in this codebase
    // already takes (replenishTemplateIfNeeded, replenishPayloadSupplyIfNeeded).
    try {
      const evaluation = await evaluatePlatformSubmissionIfNeeded(applicationId);

      if (evaluation.status === "processed" && evaluation.decision === "ACCEPTED") {
        // M6: a real on-chain payout can take long enough that running it
        // inside this request would make the tasker's submit call hang on
        // a transfer they have no reason to wait for. after() (next/server)
        // defers the call until after the 201 response below is already
        // sent, while -- unlike a bare fire-and-forget promise -- still
        // guaranteeing it runs to completion. processPlatformPayoutIfEligible
        // never throws (every failure mode is a typed result), but this
        // catch matches the same best-effort posture as the evaluation
        // call above in case something upstream of it still does.
        after(async () => {
          try {
            const payout = await processPlatformPayoutIfEligible(applicationId);
            if (payout.outcome !== "completed" && payout.outcome !== "not_applicable") {
              log.error("platform_payout_not_completed", {
                applicationId,
                outcome: payout.outcome,
                reason: payout.reason,
              });
            }
          } catch (err) {
            log.error("platform_payout_trigger_failed", {
              applicationId,
              message: err instanceof Error ? err.message : String(err),
            });
          }
        });
      }
    } catch (err) {
      log.error("platform_submission_evaluation_failed", {
        applicationId,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json(
      { status: "submitted", submissionId: submission.id },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof DuplicateSubmissionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    log.error("create_submission_failed", {
      applicationId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to submit work." },
      { status: 500 }
    );
  }
}
