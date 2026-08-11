import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { generateTaskDraft, TaskGenerationError } from "@/lib/ai/generateTask";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";
import { log } from "@/lib/log";

const MAX_HINT_LENGTH = 500;

function extractHint(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("hint" in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>).hint;
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

export async function POST(request: Request) {
  // Session-gated even though this route never touches the database --
  // unlike every other read, a call here triggers a paid external API
  // request, so it must not be reachable anonymously.
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
    `ai:generateTask:${sessionUser.id}`,
    RATE_LIMITS.aiGenerateTask
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

  const hint = extractHint(body);
  if (hint && hint.length > MAX_HINT_LENGTH) {
    return NextResponse.json(
      { error: `hint must be ${MAX_HINT_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  // This route only ever returns a draft -- it never writes to the
  // database. Persisting a task, AI-drafted or not, still happens
  // exclusively through the existing, unmodified POST /api/tasks, which
  // re-derives creatorId from the session and re-validates everything
  // independently of anything decided here.
  const startedAt = Date.now();
  try {
    const draft = await generateTaskDraft(hint);
    log.info("generate_task_succeeded", { durationMs: Date.now() - startedAt });
    return NextResponse.json(draft, { status: 200 });
  } catch (err) {
    log.error("generate_task_failed", {
      durationMs: Date.now() - startedAt,
      errorType: err instanceof TaskGenerationError ? "TaskGenerationError" : "unexpected",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to generate a task. Please try again." },
      { status: 502 }
    );
  }
}
