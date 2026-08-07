import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isValidAddress } from "@/lib/utils/address";
import { getTaskById } from "@/services/marketplace/mockTasks";
import { getUserByWallet } from "@/services/users/walletUser";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  createApplication,
  getMyTasks,
  DuplicateApplicationError,
} from "@/services/applications/applicationsService";
import { createApplicationSubmittedNotification } from "@/services/dashboard/mockNotificationService";

function extractString(body: unknown, key: string): string | undefined {
  if (typeof body !== "object" || body === null || !(key in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");

  if (!wallet || !isValidAddress(wallet)) {
    return NextResponse.json(
      { error: "A valid wallet address is required." },
      { status: 400 }
    );
  }

  const user = await getUserByWallet(wallet);
  if (!user) {
    return NextResponse.json({ tasks: [] });
  }

  const tasks = await getMyTasks(user.id);
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

  try {
    await createApplication(taskId, sessionUser.id);
  } catch (err) {
    if (err instanceof DuplicateApplicationError) {
      return NextResponse.json(
        { status: "duplicate", error: err.message },
        { status: 409 }
      );
    }

    console.error("Failed to create application:", err);
    return NextResponse.json(
      { error: "Failed to create application." },
      { status: 500 }
    );
  }

  try {
    await createApplicationSubmittedNotification(sessionUser.id, task.title);
  } catch (err) {
    console.error("Failed to create application-submitted notification:", err);
  }

  return NextResponse.json({ status: "created" }, { status: 201 });
}
