import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseUnits } from "viem";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  getTaskForFunding,
  isFundingTxHashUsed,
  markTaskFunded,
} from "@/services/marketplace/mockTasks";
import { verifyApprovalTransaction } from "@/lib/arc/verifyApproval";
import { EXECUTOR_ADDRESS } from "@/lib/arc/executor";
import { USDC_DECIMALS } from "@/lib/arc/tokens";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function extractString(body: unknown, key: string): string | undefined {
  if (typeof body !== "object" || body === null || !(key in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const txHash = extractString(body, "txHash");
  if (!txHash || !TX_HASH_RE.test(txHash)) {
    return NextResponse.json(
      { error: "A valid txHash is required." },
      { status: 400 }
    );
  }

  // creatorId/creatorWalletAddress/rewardUsdc all come from the database
  // record itself -- never from this request body -- so nothing the client
  // sends can influence who is authorized or how much must be approved.
  const task = await getTaskForFunding(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (task.creatorId !== sessionUser.id) {
    return NextResponse.json(
      { error: "Only the task creator can fund this task." },
      { status: 403 }
    );
  }

  if (task.fundingStatus !== "unfunded") {
    return NextResponse.json(
      { error: `Task is already ${task.fundingStatus}.` },
      { status: 409 }
    );
  }

  // The on-chain Approval event proves an allowance was granted, not which
  // task it was granted for -- reject reuse of a transaction that already
  // funded a different task before spending an RPC call to verify it again.
  if (await isFundingTxHashUsed(txHash)) {
    return NextResponse.json(
      { error: "This transaction has already been used to fund another task." },
      { status: 409 }
    );
  }

  const expectedAmount = parseUnits(task.rewardUsdc.toFixed(2), USDC_DECIMALS);

  const verification = await verifyApprovalTransaction({
    txHash,
    expectedOwner: task.creatorWalletAddress as `0x${string}`,
    expectedSpender: EXECUTOR_ADDRESS,
    expectedAmount,
  });

  if (!verification.ok) {
    return NextResponse.json({ error: verification.reason }, { status: 400 });
  }

  // Atomic, conditional on the row still being unfunded -- closes the race
  // between the check above and this write, so two concurrent, both-valid
  // requests for the same task can never both succeed.
  const funded = await markTaskFunded(taskId, txHash, task.rewardUsdc);
  if (!funded) {
    return NextResponse.json(
      { error: "Task was already funded by a concurrent request." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { status: "funded", fundingTxHash: txHash },
    { status: 200 }
  );
}
