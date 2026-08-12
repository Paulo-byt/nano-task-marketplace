import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { applications, payouts, tasks, users } from "@/db/schema";
import type { Task } from "@/types/task";
import type { PostedTask } from "@/types/postedTask";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TASK_SELECTION = {
  id: tasks.id,
  title: tasks.title,
  description: tasks.description,
  rewardUsdc: tasks.rewardUsdc,
  category: tasks.category,
  difficulty: tasks.difficulty,
  estimatedTime: tasks.estimatedTime,
  creatorDisplayName: users.displayName,
  creatorWalletAddress: users.walletAddress,
  fundingStatus: tasks.fundingStatus,
  fundingTxHash: tasks.fundingTxHash,
  fundedAmountUsdc: tasks.fundedAmountUsdc,
};

type TaskRow = {
  id: string;
  title: string;
  description: string;
  rewardUsdc: string;
  category: Task["category"];
  difficulty: Task["difficulty"];
  estimatedTime: string;
  creatorDisplayName: string | null;
  creatorWalletAddress: string;
  fundingStatus: Task["fundingStatus"];
  fundingTxHash: string | null;
  fundedAmountUsdc: string | null;
};

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    rewardUsdc: Number(row.rewardUsdc),
    category: row.category,
    difficulty: row.difficulty,
    estimatedTime: row.estimatedTime,
    creator: row.creatorDisplayName ?? row.creatorWalletAddress,
    creatorWalletAddress: row.creatorWalletAddress,
    fundingStatus: row.fundingStatus,
    fundingTxHash: row.fundingTxHash,
    fundedAmountUsdc:
      row.fundedAmountUsdc === null ? null : Number(row.fundedAmountUsdc),
  };
}

export async function getTasks(): Promise<Task[]> {
  const rows = await db
    .select(TASK_SELECTION)
    .from(tasks)
    .innerJoin(users, eq(tasks.creatorId, users.id))
    .orderBy(tasks.createdAt);

  return rows.map(toTask);
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  if (!UUID_RE.test(id)) {
    return undefined;
  }

  const rows = await db
    .select(TASK_SELECTION)
    .from(tasks)
    .innerJoin(users, eq(tasks.creatorId, users.id))
    .where(eq(tasks.id, id))
    .limit(1);

  return rows[0] ? toTask(rows[0]) : undefined;
}

export interface CreateTaskInput {
  creatorId: string;
  title: string;
  description: string;
  rewardUsdc: number;
  category: Task["category"];
  difficulty: Task["difficulty"];
  estimatedTime: string;
}

/**
 * Inserts a new task for an already-authenticated creator. Only the columns
 * listed here are ever written -- status, funding_status, funding_tx_hash,
 * funded_amount_usdc, and funded_at are intentionally left unset so they
 * take their database defaults ("open" / "unfunded" / null). Funding is a
 * separate, later Phase 7 step and must never be reachable from task
 * creation.
 */
export async function createTask(
  input: CreateTaskInput
): Promise<{ id: string }> {
  const [row] = await db
    .insert(tasks)
    .values({
      title: input.title,
      description: input.description,
      rewardUsdc: input.rewardUsdc.toFixed(2),
      category: input.category,
      difficulty: input.difficulty,
      estimatedTime: input.estimatedTime,
      creatorId: input.creatorId,
    })
    .returning({ id: tasks.id });

  return row;
}

export interface TaskFundingRecord {
  id: string;
  creatorId: string;
  creatorWalletAddress: string;
  rewardUsdc: number;
  fundingStatus: Task["fundingStatus"];
}

/**
 * The server-side counterpart to getTaskById: exposes the raw creatorId
 * (for an exact ownership comparison against the session user, rather than
 * a case-normalized wallet-address string comparison) and the current
 * funding_status, without the display-only fields the client-facing Task
 * shape carries.
 */
export async function getTaskForFunding(
  id: string
): Promise<TaskFundingRecord | undefined> {
  if (!UUID_RE.test(id)) {
    return undefined;
  }

  const rows = await db
    .select({
      id: tasks.id,
      creatorId: tasks.creatorId,
      creatorWalletAddress: users.walletAddress,
      rewardUsdc: tasks.rewardUsdc,
      fundingStatus: tasks.fundingStatus,
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.creatorId, users.id))
    .where(eq(tasks.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return undefined;
  }

  return { ...row, rewardUsdc: Number(row.rewardUsdc) };
}

/**
 * The Approval event a funding tx verifies against carries no task
 * identifier -- it only proves an owner approved a spender for an amount.
 * Without this check, the same real, successfully-verified transaction
 * could be submitted for a second task (same creator, same reward amount)
 * and would independently pass verification there too, marking a task
 * "funded" against an allowance that may already be spoken for. This is an
 * application-level guard rather than a database constraint: acceptable
 * because the underlying ERC-20 allowance itself still prevents any actual
 * double-spend (a second transferFrom against an already-consumed
 * allowance simply fails at payout time), so the residual risk is a
 * misleading "funded" label rather than lost funds. A unique index on
 * funding_tx_hash would close this more strictly and is a reasonable, cheap
 * addition whenever a later step next touches this schema.
 */
export async function isFundingTxHashUsed(txHash: string): Promise<boolean> {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.fundingTxHash, txHash))
    .limit(1);

  return rows.length > 0;
}

/**
 * Atomically transitions a task from unfunded to funded, guarded by a
 * WHERE clause on the current funding_status rather than a separate
 * check-then-update -- this is what makes double-funding impossible even
 * under a race between two concurrent, independently-verified requests for
 * the same task. Returns false (without writing anything) if the task was
 * not unfunded at the moment of the update, so the caller can distinguish
 * "verified but lost the race" from "verified and applied."
 */
export async function markTaskFunded(
  taskId: string,
  txHash: string,
  amountUsdc: number
): Promise<boolean> {
  const rows = await db
    .update(tasks)
    .set({
      fundingStatus: "funded",
      fundingTxHash: txHash,
      fundedAmountUsdc: amountUsdc.toFixed(2),
      fundedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.fundingStatus, "unfunded")))
    .returning({ id: tasks.id });

  return rows.length > 0;
}

/**
 * Atomically cancels a task and rejects its still-"applied" applications in
 * one transaction (Step 9). The NOT EXISTS clause is what actually makes
 * this race-safe against an active payout -- not the route's earlier
 * hasPendingPayoutForTask check, which is only a friendly pre-check for a
 * clear error message, the same split already used by the payout route
 * (preflightPayout + a recheck, then the real atomic guard at the write).
 * A payout that commits after this UPDATE has already read its snapshot
 * cannot be missed: Postgres evaluates the whole statement, subquery
 * included, against one consistent snapshot, so either the payout is
 * already visible here (cancellation correctly fails) or it is not yet
 * committed at all (ordinary read-committed race, same class already
 * accepted for approve/payout and documented on the deferred backlog).
 *
 * The NOT EXISTS status check covers both 'pending' and 'retrying' --
 * Fix #9. A 'retrying' payout (Fix #8) represents real, in-flight
 * reconciliation/submission work exactly like 'pending' does, so a task
 * cancellation racing against an active retry must lose the same way it
 * already loses against a fresh release: whichever write actually commits
 * first wins, and the loser's own conditional guard simply matches zero
 * rows. 'failed', 'completed', and 'cancelled' are deliberately not
 * included -- none of them represent an in-flight operation, and 'failed'
 * in particular must stay cancellable, since it is the whole reason Fix #8's
 * retry path exists.
 *
 * markPayoutRetrying (payoutsService.ts) symmetrically checks this task's
 * live fundingStatus before ever writing 'retrying', so whichever of the
 * two writes commits first is the one the other correctly loses against.
 * That said, this remains an ordinary read-committed race, not a
 * lock-based one -- see markPayoutRetrying's own doc comment for the
 * measured residual (a rare, narrow write-skew window that neither guard
 * fully eliminates on its own).
 *
 * If the task update matches, every application still "applied" for this
 * task is rejected in the same transaction -- gated on status = 'applied'
 * so an application concurrently approved in the same window (the known,
 * documented cancel-vs-approve race) is correctly left untouched rather
 * than incorrectly rejected out from under an approval that already won.
 */
export async function cancelTask(taskId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasks)
      .set({ fundingStatus: "cancelled" })
      .where(
        and(
          eq(tasks.id, taskId),
          inArray(tasks.fundingStatus, ["unfunded", "funded"]),
          sql`NOT EXISTS (
            SELECT 1 FROM ${payouts}
            INNER JOIN ${applications} ON ${payouts.applicationId} = ${applications.id}
            WHERE ${applications.taskId} = ${tasks.id} AND ${payouts.status} IN ('pending', 'retrying')
          )`
        )
      )
      .returning({ id: tasks.id });

    if (!updated) {
      return false;
    }

    await tx
      .update(applications)
      .set({ status: "rejected" })
      .where(
        and(eq(applications.taskId, taskId), eq(applications.status, "applied"))
      );

    return true;
  });
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Tasks created by creatorId, with an applicant count per task. creatorId
 * must come from getSessionUser() at the call site -- this function has no
 * way to enforce that itself, it simply returns whatever it's asked for, so
 * the route handler is the trust boundary.
 */
export async function getPostedTasksByCreator(
  creatorId: string
): Promise<PostedTask[]> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      rewardUsdc: tasks.rewardUsdc,
      category: tasks.category,
      difficulty: tasks.difficulty,
      fundingStatus: tasks.fundingStatus,
      createdAt: tasks.createdAt,
      applicantCount: sql<number>`count(${applications.id})`,
    })
    .from(tasks)
    .leftJoin(applications, eq(applications.taskId, tasks.id))
    .where(eq(tasks.creatorId, creatorId))
    .groupBy(tasks.id)
    .orderBy(desc(tasks.createdAt));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    rewardUsdc: Number(row.rewardUsdc),
    category: row.category,
    difficulty: row.difficulty,
    fundingStatus: row.fundingStatus,
    createdAt: formatDate(row.createdAt),
    applicantCount: Number(row.applicantCount),
  }));
}
