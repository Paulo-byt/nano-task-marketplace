import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createTask, getTasks, MARKETPLACE_PAGE_SIZE } from "@/services/marketplace/mockTasks";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rateLimit";
import type { Task } from "@/types/task";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_CATEGORIES = [
  "Writing",
  "AI",
  "Research",
  "Design",
  "Social",
] as const;

const ALLOWED_DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"] as const;

const MIN_REWARD_USDC = 0.01;
const MAX_REWARD_USDC = 5.0;
const MAX_SEARCH_LENGTH = 200;

/**
 * Marketplace listing/pagination. Deliberately not behind a session
 * requirement -- browsing is anonymous-friendly today (TaskCard/TaskDetails
 * have no auth gate), so a missing or invalid session cookie here means
 * "anonymous viewer," never 401. When a valid session *is* present, the
 * resolved user id is passed to getTasks() so it can exclude tasks the
 * viewer already has an application against.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = sessionId ? await getSessionUser(sessionId) : undefined;

  const rateLimitResult = checkRateLimit(
    sessionUser ? `read:${sessionUser.id}` : `read:ip:${getClientIp(request)}`,
    RATE_LIMITS.authenticatedRead
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  const url = new URL(request.url);
  const cursorCreatedAt = url.searchParams.get("cursorCreatedAt");
  const cursorId = url.searchParams.get("cursorId");
  const categoryParam = url.searchParams.get("category");
  const searchParam = url.searchParams.get("search");

  if (Boolean(cursorCreatedAt) !== Boolean(cursorId)) {
    return NextResponse.json(
      { error: "cursorCreatedAt and cursorId must both be provided together." },
      { status: 400 }
    );
  }

  let cursor: { createdAt: string; id: string } | undefined;
  if (cursorCreatedAt && cursorId) {
    const parsedDate = new Date(cursorCreatedAt);
    if (Number.isNaN(parsedDate.getTime()) || !UUID_RE.test(cursorId)) {
      return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
    }
    cursor = { createdAt: parsedDate.toISOString(), id: cursorId };
  }

  let category: Task["category"] | undefined;
  if (categoryParam) {
    if (!(ALLOWED_CATEGORIES as readonly string[]).includes(categoryParam)) {
      return NextResponse.json(
        { error: `category must be one of: ${ALLOWED_CATEGORIES.join(", ")}.` },
        { status: 400 }
      );
    }
    category = categoryParam as Task["category"];
  }

  const search = searchParam?.trim().slice(0, MAX_SEARCH_LENGTH) || undefined;

  // pageSize is never accepted from the client -- a fixed, server-controlled
  // page size is what keeps this a real per-request bound rather than a
  // number a caller could inflate to fetch everything in one request.
  const page = await getTasks({
    viewerId: sessionUser?.id,
    cursor,
    pageSize: MARKETPLACE_PAGE_SIZE,
    category,
    search,
  });

  return NextResponse.json(page);
}

function extractString(body: unknown, key: string): string | undefined {
  if (typeof body !== "object" || body === null || !(key in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function extractReward(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null || !("rewardUsdc" in body)) {
    return undefined;
  }
  const raw = (body as Record<string, unknown>).rewardUsdc;
  const value =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;

  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Math.round(value * 100) / 100;
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
    `tasks:create:${sessionUser.id}`,
    RATE_LIMITS.taskCreate
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

  const title = extractString(body, "title");
  const description = extractString(body, "description");
  const estimatedTime = extractString(body, "estimatedTime");
  const category = extractString(body, "category");
  const difficulty = extractString(body, "difficulty");
  const rewardUsdc = extractReward(body);

  if (!title || !description || !estimatedTime) {
    return NextResponse.json(
      { error: "title, description, and estimatedTime are required." },
      { status: 400 }
    );
  }

  if (
    !category ||
    !(ALLOWED_CATEGORIES as readonly string[]).includes(category)
  ) {
    return NextResponse.json(
      { error: `category must be one of: ${ALLOWED_CATEGORIES.join(", ")}.` },
      { status: 400 }
    );
  }

  if (
    !difficulty ||
    !(ALLOWED_DIFFICULTIES as readonly string[]).includes(difficulty)
  ) {
    return NextResponse.json(
      {
        error: `difficulty must be one of: ${ALLOWED_DIFFICULTIES.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  if (
    rewardUsdc === undefined ||
    rewardUsdc < MIN_REWARD_USDC ||
    rewardUsdc > MAX_REWARD_USDC
  ) {
    return NextResponse.json(
      {
        error: `rewardUsdc must be between ${MIN_REWARD_USDC} and ${MAX_REWARD_USDC}.`,
      },
      { status: 400 }
    );
  }

  // creatorId always comes from the verified session, never from the
  // request body -- a client cannot create a task on another user's behalf.
  const task = await createTask({
    creatorId: sessionUser.id,
    title,
    description,
    rewardUsdc,
    category: category as Task["category"],
    difficulty: difficulty as Task["difficulty"],
    estimatedTime,
  });

  return NextResponse.json({ id: task.id }, { status: 201 });
}
