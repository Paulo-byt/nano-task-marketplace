import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getTaskById, getTaskForFunding } from "@/services/marketplace/mockTasks";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  createApplication,
  getMyTasks,
  approveApplication,
  DuplicateApplicationError,
  ApplicationNotApprovableError,
} from "@/services/applications/applicationsService";
import {
  getTaskTemplateId,
  replenishTemplateIfNeeded,
} from "@/services/marketplace/taskTemplatesService";
import {
  createApplicationSubmittedNotification,
  createNewApplicationNotification,
} from "@/services/dashboard/mockNotificationService";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";
import { log } from "@/lib/log";

function extractString(body: unknown, key: string): string | undefined {
  if (typeof body !== "object" || body === null || !(key in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export async function GET() {
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
    `read:${sessionUser.id}`,
    RATE_LIMITS.authenticatedRead
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  const tasks = await getMyTasks(sessionUser.id);
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
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
    `applications:create:${sessionUser.id}`,
    RATE_LIMITS.applicationCreate
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const taskId = extractString(body, "taskId");
  if (!taskId) {
    return NextResponse.json(
      { error: "taskId is required." },
      { status: 400 }
    );
  }

  const task = await getTaskById(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  // task.fundingStatus/status both come from the database row fetched
  // above, never from this request body -- a client cannot claim a task is
  // funded or open. This is a friendly pre-check, not the real safety
  // guarantee for the race against a concurrent approval closing the task:
  // the outcome that check protects against (a dangling application for an
  // already-closed task) can never be approved later regardless, since
  // approveApplication's own atomic task-closing guard would reject it --
  // matching this codebase's established "friendly pre-check, atomic guard
  // is what actually matters" split, proportionate to the fact that this
  // race's worst case has no financial consequence, unlike approval's own.
  if (task.fundingStatus !== "funded") {
    return NextResponse.json(
      { status: "not_funded", error: "Task is not funded yet." },
      { status: 409 }
    );
  }

  if (task.status !== "open") {
    return NextResponse.json(
      { status: "not_open", error: "This task is no longer accepting applications." },
      { status: 409 }
    );
  }

  let application;
  try {
    application = await createApplication(taskId, sessionUser.id);
  } catch (err) {
    if (err instanceof DuplicateApplicationError) {
      return NextResponse.json(
        { status: "duplicate", error: err.message },
        { status: 409 }
      );
    }

    log.error("create_application_failed", {
      taskId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to create application." },
      { status: 500 }
    );
  }

  try {
    await createApplicationSubmittedNotification(sessionUser.id, task.title);
  } catch (err) {
    log.error("create_application_notification_failed", {
      taskId,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // 11E: creator-facing "someone applied" -- creator-owned tasks only.
  // A platform-owned task's "creator" is the platform sentinel account,
  // which has no session and no one reading its notifications. Fully
  // independent read (own getTaskTemplateId/getTaskForFunding calls, not
  // reused from the auto-approval branch below) so this best-effort block
  // can never influence that branch's own behavior.
  try {
    const templateId = await getTaskTemplateId(taskId);
    if (!templateId) {
      const fundingRecord = await getTaskForFunding(taskId);
      if (fundingRecord) {
        await createNewApplicationNotification(fundingRecord.creatorId, taskId);
      }
    }
  } catch (err) {
    log.error("new_application_notification_failed", {
      taskId,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // M4: platform-generated task instances have no human creator with a
  // session to click "approve" -- tasks.templateId (set only by
  // generateTaskInstance) is the existing, schema-documented signal that
  // this is one. getTaskTemplateId returns null for every ordinary,
  // creator-posted task, so this block is a pure no-op for the entire
  // existing marketplace: its response stays byte-identical to before.
  //
  // Auto-approval reuses approveApplication exactly as the human-triggered
  // approve route already does -- same atomic task-closing UPDATE, same
  // stress-tested concurrency guarantee (see that function's own doc
  // comment: 0/25 invalid combinations across concurrent approval
  // attempts for one task). Two applicants racing for the same platform
  // task is structurally the same race as two applicants racing for a
  // human creator's approval; nothing new needed to make it safe. The
  // application row this route just created is never deleted or altered
  // if this loses that race -- it stays "applied" on the now-closed task,
  // the exact same state an ordinary task's un-approved applicants are
  // already left in today.
  const templateId = await getTaskTemplateId(taskId);
  if (!templateId) {
    return NextResponse.json({ status: "created" }, { status: 201 });
  }

  const response: Record<string, unknown> = {
    status: "created",
    applicationId: application.id,
  };

  try {
    const result = await approveApplication(application.id, taskId, task.rewardUsdc);
    response.status = "approved";
    response.payoutId = result.payoutId;

    try {
      await replenishTemplateIfNeeded(templateId, taskId);
    } catch (err) {
      log.error("apply_auto_approval_replenishment_failed", {
        applicationId: application.id,
        taskId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  } catch (err) {
    if (err instanceof ApplicationNotApprovableError) {
      response.autoApprovalNote =
        "This task was already claimed by another applicant.";
    } else {
      log.error("apply_auto_approval_failed", {
        applicationId: application.id,
        taskId,
        message: err instanceof Error ? err.message : String(err),
      });
      response.autoApprovalNote = "Automatic approval could not be completed.";
    }
  }

  return NextResponse.json(response, { status: 201 });
}
