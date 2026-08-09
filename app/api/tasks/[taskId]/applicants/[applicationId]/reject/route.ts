import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getTaskForFunding } from "@/services/marketplace/mockTasks";
import {
  getApplicationForApproval,
  rejectApplication,
} from "@/services/applications/applicationsService";

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

  const { taskId, applicationId } = await params;

  // Every value used below comes from these database lookups. This route
  // never reads a request body, so there is no creatorId, walletAddress,
  // or application identity for a client to forge.
  const task = await getTaskForFunding(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (task.creatorId !== sessionUser.id) {
    return NextResponse.json(
      { error: "Only the task creator can reject applications for this task." },
      { status: 403 }
    );
  }

  // Deliberately no funding-status check here: unlike approve/payout,
  // rejection moves no money and is allowed regardless of the task's
  // current funding status (LOCKED DECISION #1).

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

  const rejected = await rejectApplication(applicationId);
  if (!rejected) {
    return NextResponse.json(
      { error: "Application is no longer in a rejectable state." },
      { status: 409 }
    );
  }

  return NextResponse.json({ status: "rejected" }, { status: 200 });
}
