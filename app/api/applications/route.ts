import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getTaskById } from "@/services/marketplace/mockTasks";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  createApplication,
  getMyTasks,
  DuplicateApplicationError,
} from "@/services/applications/applicationsService";
import { createApplicationSubmittedNotification } from "@/services/dashboard/mockNotificationService";
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

  try {
    await createApplication(taskId, sessionUser.id);
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

  return NextResponse.json({ status: "created" }, { status: 201 });
}
