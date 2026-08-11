import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createTask } from "@/services/marketplace/mockTasks";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";
import type { Task } from "@/types/task";

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
