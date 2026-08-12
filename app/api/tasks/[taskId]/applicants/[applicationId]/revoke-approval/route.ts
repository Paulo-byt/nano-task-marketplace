import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getTaskForFunding } from "@/services/marketplace/mockTasks";
import {
  getApplicationForApproval,
  revokeApproval,
  ApprovalNotRevocableError,
} from "@/services/applications/applicationsService";
import { getPayoutForApplication } from "@/services/payouts/payoutsService";
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
    `applicants:revokeApproval:${sessionUser.id}`,
    RATE_LIMITS.applicationRevokeApproval
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  const { taskId, applicationId } = await params;

  // Every value used below comes from these database lookups. This route
  // never reads a request body, so there is no creatorId, walletAddress,
  // or application identity for a client to forge -- the same trust
  // boundary as approve/reject/payout.
  const task = await getTaskForFunding(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (task.creatorId !== sessionUser.id) {
    return NextResponse.json(
      { error: "Only the task creator can revoke an approval for this task." },
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

  // Friendly pre-check for a clear message, matching the established
  // "friendly pre-check + atomic final guard" split already used by the
  // payout route and cancelTask -- this is not the real safety guarantee,
  // just a nicer error for the common case. The real guarantee is
  // revokeApproval's own conditional UPDATE below, evaluated fresh at
  // write time against the database's live row, never against this read.
  if (application.status !== "approved") {
    return NextResponse.json(
      { error: `Application is already ${application.status}.` },
      { status: 409 }
    );
  }

  const payout = await getPayoutForApplication(applicationId);
  if (payout?.payoutStatus === "completed") {
    return NextResponse.json(
      {
        error:
          "This application's payout has already completed and can no longer be revoked.",
      },
      { status: 409 }
    );
  }

  try {
    const result = await revokeApproval(applicationId);
    return NextResponse.json(
      { status: "rejected", payoutId: result.payoutId },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof ApprovalNotRevocableError) {
      // Reached when the friendly pre-checks above passed but the
      // database's own state had already changed by the time the atomic
      // transaction ran -- e.g. the payout completed in the moments
      // between this request's reads and its write. Not an error worth
      // logging loudly; it's the guard working exactly as intended.
      return NextResponse.json({ error: err.message }, { status: 409 });
    }

    log.error("revoke_approval_failed", {
      applicationId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to revoke approval." },
      { status: 500 }
    );
  }
}
