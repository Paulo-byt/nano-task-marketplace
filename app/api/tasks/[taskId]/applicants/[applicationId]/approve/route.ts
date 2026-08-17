import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getTaskForFunding } from "@/services/marketplace/mockTasks";
import {
  getApplicationForApproval,
  approveApplication,
  ApplicationNotApprovableError,
} from "@/services/applications/applicationsService";
import {
  getTaskTemplateId,
  replenishTemplateIfNeeded,
} from "@/services/marketplace/taskTemplatesService";
import { createApplicationApprovedNotification } from "@/services/dashboard/mockNotificationService";
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
    `applicants:approve:${sessionUser.id}`,
    RATE_LIMITS.applicationApprove
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  const { taskId, applicationId } = await params;

  // creatorId and rewardUsdc both come from the database record itself --
  // this route never reads a request body, so there is nothing for a
  // client to forge (no creatorId, walletAddress, amount, or worker
  // identity is ever accepted as input).
  const task = await getTaskForFunding(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (task.creatorId !== sessionUser.id) {
    return NextResponse.json(
      { error: "Only the task creator can approve applications for this task." },
      { status: 403 }
    );
  }

  if (task.fundingStatus !== "funded") {
    return NextResponse.json(
      { error: "Task must be funded before approving applications." },
      { status: 409 }
    );
  }

  const application = await getApplicationForApproval(applicationId);
  if (!application || application.taskId !== taskId) {
    return NextResponse.json(
      { error: "Application not found for this task." },
      { status: 404 }
    );
  }

  if (application.status !== "applied") {
    return NextResponse.json(
      { error: `Application is already ${application.status}.` },
      { status: 409 }
    );
  }

  try {
    const result = await approveApplication(applicationId, taskId, task.rewardUsdc);

    // Best-effort supply replenishment, appended after approval's own
    // success -- never allowed to turn a successful approval into an
    // error response. This task just left marketplace availability
    // (status: open -> closed); if it came from a platform template,
    // that's exactly the signal to check whether the template needs
    // topping back up toward its target (Phase 11C: instance generation
    // & supply replenishment).
    try {
      const templateId = await getTaskTemplateId(taskId);
      if (templateId) {
        await replenishTemplateIfNeeded(templateId, taskId);
      }
    } catch (err) {
      log.error("approve_replenishment_check_failed", {
        applicationId,
        taskId,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    // 11E: best-effort, appended after approval's own success -- never
    // allowed to turn a successful approval into an error response,
    // matching the replenishment check's own posture immediately above.
    try {
      await createApplicationApprovedNotification(application.applicantId, taskId);
    } catch (err) {
      log.error("approve_notification_failed", {
        applicationId,
        taskId,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json(
      { status: "approved", payoutId: result.payoutId },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof ApplicationNotApprovableError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }

    log.error("approve_application_failed", {
      applicationId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to approve application." },
      { status: 500 }
    );
  }
}
