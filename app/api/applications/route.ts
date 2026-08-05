import { NextResponse } from "next/server";
import { getTaskById } from "@/services/marketplace/mockTasks";
import { getDemoUser } from "@/services/users/demoUser";
import {
  createApplication,
  DuplicateApplicationError,
} from "@/services/applications/applicationsService";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const taskId =
    typeof body === "object" && body !== null && "taskId" in body
      ? (body as { taskId?: unknown }).taskId
      : undefined;

  if (typeof taskId !== "string" || taskId.trim() === "") {
    return NextResponse.json(
      { error: "taskId is required." },
      { status: 400 }
    );
  }

  const task = await getTaskById(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const demoUser = await getDemoUser();

  try {
    await createApplication(taskId, demoUser.id);
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
