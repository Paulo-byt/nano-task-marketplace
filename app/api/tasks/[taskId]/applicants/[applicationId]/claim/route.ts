import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getApplicationForApproval } from "@/services/applications/applicationsService";
import { getTaskTemplateId } from "@/services/marketplace/taskTemplatesService";
import { isActiveTierTemplate } from "@/lib/evaluation/platformGroundTruth";
import { processPlatformPayoutIfEligible } from "@/services/marketplace/platformPayoutService";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";
import { log } from "@/lib/log";

/**
 * Tester release (Option A): explicit Claim Reward for an active-tier
 * platform task. This route adds authorization and eligibility framing
 * around a call to processPlatformPayoutIfEligible -- the exact same,
 * completely unmodified primitive the (now-removed, for active-tier
 * templates) automatic after() trigger in submit/route.ts used to call.
 * Every on-chain and accounting safety check that already exists there
 * (preflight, atomic conditional payout-status update, receipt
 * verification, idempotent "already resolved" handling) is inherited
 * unchanged -- nothing about payout mechanics is reimplemented here.
 *
 * This route's own, new responsibility is narrow: confirm the caller is
 * the application's real owner (a server-resolved session, never a
 * client-supplied wallet), confirm the task is an active-tier
 * platform-owned task (paused-tier and creator-owned tasks are paid
 * through their own existing, unchanged paths), and only then hand off to
 * processPlatformPayoutIfEligible, which independently re-verifies
 * evaluationVerdict === "meets_requirements" and payout.status === "pending"
 * from the database itself -- never trusting anything this route or the
 * client claims. No money moves merely because this route is called: every
 * one of those conditions must already be true in the database, or the
 * call is a safe, typed no-op.
 */
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
    `applicants:claim:${sessionUser.id}`,
    RATE_LIMITS.applicationClaim
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  const { taskId, applicationId } = await params;

  // Every value used below comes from this database lookup -- the same
  // "never trust a client-supplied identity" posture as submit/route.ts.
  const application = await getApplicationForApproval(applicationId);
  if (!application || application.taskId !== taskId) {
    return NextResponse.json(
      { error: "Application not found for this task." },
      { status: 404 }
    );
  }

  if (application.applicantId !== sessionUser.id) {
    return NextResponse.json(
      { error: "Only the applicant who owns this application can claim its reward." },
      { status: 403 }
    );
  }

  const templateId = await getTaskTemplateId(taskId);
  if (!(await isActiveTierTemplate(templateId))) {
    return NextResponse.json(
      {
        error:
          "This task is not eligible for an explicit claim -- its reward, if any, is " +
          "handled automatically.",
      },
      { status: 409 }
    );
  }

  try {
    const payout = await processPlatformPayoutIfEligible(applicationId);

    if (payout.outcome === "completed") {
      return NextResponse.json(
        { status: "claimed", txHash: payout.txHash },
        { status: 200 }
      );
    }

    if (payout.outcome === "not_applicable") {
      return NextResponse.json(
        { error: payout.reason ?? "This submission is not eligible for a reward claim." },
        { status: 409 }
      );
    }

    if (payout.outcome === "already_resolved") {
      return NextResponse.json(
        { error: payout.reason ?? "This reward has already been resolved." },
        { status: 409 }
      );
    }

    // preflight_failed / submission_failed / receipt_failed /
    // verification_failed / no_payout_row -- a real attempt was made (or a
    // genuine, retriable precondition failed); never surfaced as a silent
    // success, and left exactly as processPlatformPayoutIfEligible's own
    // atomic state left it (retriable "pending" for preflight_failed,
    // "failed" with a recorded txHash otherwise) -- this route invents no
    // new state of its own.
    log.error("claim_reward_not_completed", {
      applicationId,
      outcome: payout.outcome,
      reason: payout.reason,
    });
    return NextResponse.json(
      {
        error:
          payout.reason ??
          "The reward could not be claimed right now. Please try again shortly.",
      },
      { status: 502 }
    );
  } catch (err) {
    log.error("claim_reward_failed", {
      applicationId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to claim reward." }, { status: 500 });
  }
}
