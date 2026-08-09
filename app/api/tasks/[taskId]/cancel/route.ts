import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { cancelTask, getTaskForFunding } from "@/services/marketplace/mockTasks";
import { hasPendingPayoutForTask } from "@/services/payouts/payoutsService";

export async function POST(
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

  // Every value used below comes from these database lookups. This route
  // never reads a request body, so there is no creatorId or walletAddress
  // for a client to forge.
  const task = await getTaskForFunding(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (task.creatorId !== sessionUser.id) {
    return NextResponse.json(
      { error: "Only the task creator can cancel this task." },
      { status: 403 }
    );
  }

  if (task.fundingStatus !== "unfunded" && task.fundingStatus !== "funded") {
    return NextResponse.json(
      { error: `Task is already ${task.fundingStatus}.` },
      { status: 409 }
    );
  }

  // Friendly pre-check for a clear message; the real race-safe guarantee
  // is the NOT EXISTS clause inside cancelTask's own atomic UPDATE.
  const pendingPayout = await hasPendingPayoutForTask(taskId);
  if (pendingPayout) {
    return NextResponse.json(
      { error: "Cannot cancel a task with a pending payout." },
      { status: 409 }
    );
  }

  const cancelled = await cancelTask(taskId);
  if (!cancelled) {
    return NextResponse.json(
      {
        error:
          "Task could not be cancelled -- its state changed. It may already be cancelled or a payout may now be pending.",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ status: "cancelled" }, { status: 200 });
}
