import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getTaskForFunding } from "@/services/marketplace/mockTasks";
import { getApplicantsForTask } from "@/services/applications/applicationsService";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
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

  const { taskId } = await params;

  // Reuses the same ownership-lookup already relied on by the funding
  // route -- creatorId comes from the database, never from this request.
  const task = await getTaskForFunding(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (task.creatorId !== sessionUser.id) {
    return NextResponse.json(
      { error: "Only the task creator can view its applicants." },
      { status: 403 }
    );
  }

  const applicants = await getApplicantsForTask(taskId);
  return NextResponse.json({ applicants });
}
