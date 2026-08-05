import { NextResponse } from "next/server";
import { getTaskById } from "@/services/marketplace/mockTasks";
import { getOrCreateUserByWallet, getUserByWallet } from "@/services/users/walletUser";
import {
  createApplication,
  getMyTasks,
  DuplicateApplicationError,
} from "@/services/applications/applicationsService";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

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

  if (!wallet || !ADDRESS_RE.test(wallet)) {
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const taskId = extractString(body, "taskId");
  const walletAddress = extractString(body, "walletAddress");

  if (!taskId) {
    return NextResponse.json(
      { error: "taskId is required." },
      { status: 400 }
    );
  }
  if (!walletAddress || !ADDRESS_RE.test(walletAddress)) {
    return NextResponse.json(
      { error: "A valid walletAddress is required." },
      { status: 400 }
    );
  }

  const task = await getTaskById(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const user = await getOrCreateUserByWallet(walletAddress);

  try {
    await createApplication(taskId, user.id);
    return NextResponse.json({ status: "created" }, { status: 201 });
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
}
