import { and, desc, eq, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
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
  status: tasks.status,
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
  status: Task["status"];
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
    status: row.status,
    fundingStatus: row.fundingStatus,
    fundingTxHash: row.fundingTxHash,
    fundedAmountUsdc:
      row.fundedAmountUsdc === null ? null : Number(row.fundedAmountUsdc),
  };
}

export interface TaskCursor {
  createdAt: string;
  id: string;
}

export interface GetTasksOptions {
  // The signed-in viewer's user id, if any -- omitted entirely for an
  // anonymous browser, in which case no applicant-exclusion is applied.
  viewerId?: string;
  // Absent on the first page; present on every subsequent page, taken
  // verbatim from the previous page's own nextCursor.
  cursor?: TaskCursor;
  pageSize: number;
  category?: Task["category"];
  search?: string;
}

export interface TaskPage {
  tasks: Task[];
  nextCursor: TaskCursor | null;
}

export const MARKETPLACE_PAGE_SIZE = 20;

/**
 * The single definition of "available for work" in this codebase (Phase 11,
 * read-side): status = 'open' AND funding_status = 'funded', excluding any
 * task the viewer already has an application against -- any status at all,
 * not just 'applied', since applications_task_applicant_unique means a
 * rejected applicant can never re-apply either, so re-showing the task to
 * them would be a dead end regardless. Anonymous callers (no viewerId) skip
 * that exclusion entirely rather than being shown nothing.
 *
 * Cursor/keyset pagination on (created_at, id) -- deliberately not OFFSET,
 * which degrades under exactly the condition this is designed for
 * (continuous inserts: a new task landing mid-scroll would shift every
 * subsequent offset, skipping or duplicating rows for the viewer). The id
 * tiebreaker matters because two tasks can share a created_at timestamp.
 * pageSize bounds one response only -- it is never a total-task cap, and
 * this function has no code path that limits how many tasks may exist or
 * ever become available. Fetches pageSize + 1 rows to learn whether another
 * page exists without a separate COUNT(*), which would itself become an
 * unbounded-cost query as the table grows.
 *
 * Does not touch tasks.status or tasks.funding_status as a write -- this is
 * the read-side half of the Phase 11 marketplace design. Closing a task on
 * approval and marking funding "released" on payout completion are a
 * separate, not-yet-implemented write-side phase (see the architecture
 * review); until that ships, "status = 'open'" is true for every task
 * (nothing currently sets it to 'closed'), so this filter is a no-op today
 * and becomes load-bearing the moment that phase lands -- deliberately, not
 * a bug.
 */
export async function getTasks(options: GetTasksOptions): Promise<TaskPage> {
  const { viewerId, cursor, pageSize, category, search } = options;

  const conditions: SQL[] = [
    eq(tasks.status, "open"),
    eq(tasks.fundingStatus, "funded"),
  ];

  if (viewerId) {
    conditions.push(sql`NOT EXISTS (
      SELECT 1 FROM ${applications}
      WHERE ${applications.taskId} = ${tasks.id}
        AND ${applications.applicantId} = ${viewerId}
    )`);
  }

  if (category) {
    conditions.push(eq(tasks.category, category));
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(ilike(tasks.title, pattern), ilike(tasks.description, pattern))!
    );
  }

  if (cursor) {
    const cursorCreatedAt = new Date(cursor.createdAt);
    conditions.push(
      or(
        lt(tasks.createdAt, cursorCreatedAt),
        and(eq(tasks.createdAt, cursorCreatedAt), lt(tasks.id, cursor.id))
      )!
    );
  }

  const rows = await db
    .select({ ...TASK_SELECTION, createdAt: tasks.createdAt })
    .from(tasks)
    .innerJoin(users, eq(tasks.creatorId, users.id))
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt), desc(tasks.id))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  const lastRow = page[page.length - 1];

  return {
    tasks: page.map(toTask),
    nextCursor:
      hasMore && lastRow
        ? { createdAt: lastRow.createdAt.toISOString(), id: lastRow.id }
        : null,
  };
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
 * Write-side never-ending-supply lifecycle (Phase 11 continued): marks a
 * task's funding released once its one approved application's payout has
 * genuinely completed. Called only after markPayoutCompleted has already
 * won its own atomic race -- the same "bookkeeping on an already-successful
 * fact" position as markApplicationCompleted, called alongside it from the
 * payout/retry-payout routes, never from anywhere payment-uncertain.
 * Guarded on funding_status = 'funded' (not a separate check-then-write),
 * purely as defense-in-depth: nothing else in this codebase ever moves a
 * task's funding status other than markTaskFunded, cancelTask, and this
 * call, and none of their guards overlap.
 *
 * This also narrows (though does not fully close) a pre-existing gap: with
 * fundingStatus staying 'funded' forever after completion (as it did before
 * this function existed), cancelTask's own guard -- funding_status IN
 * ('unfunded','funded') AND NOT EXISTS a pending/retrying payout -- would
 * stay satisfiable indefinitely once a payout finished (status 'completed'
 * is neither 'pending' nor 'retrying'), so a task could be cancelled after
 * its worker was already paid, at any time, not just in a brief window.
 * Calling this immediately after markPayoutCompleted succeeds shrinks that
 * window down to the ordinary read-committed timing gap already accepted
 * elsewhere in this codebase (Fix #9/#11's own documented residuals), not a
 * new class of risk -- see the write-side design report for the full
 * account of why cancelTask itself needs no code change here.
 */
export async function markTaskReleased(taskId: string): Promise<boolean> {
  const rows = await db
    .update(tasks)
    .set({ fundingStatus: "released" })
    .where(and(eq(tasks.id, taskId), eq(tasks.fundingStatus, "funded")))
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
 * so an application concurrently approved in the same window is correctly
 * left untouched rather than incorrectly rejected out from under an
 * approval that already won. approveApplication (applicationsService.ts)
 * symmetrically requires this task's live fundingStatus to still be
 * 'funded' before it can approve at all (Fix #11, the same EXISTS-clause
 * shape as markPayoutRetrying above).
 *
 * The cancel-vs-approve race against approveApplication went through three
 * stages worth recording. Fix #11 originally measured this race's
 * violation rate at ~96% (task cancelled, payout left 'pending').
 * approveApplication's write-side rewrite (Phase 11 continued) added a
 * task-closing UPDATE gated on status = 'open' as its first statement,
 * which sharply narrowed the race to 3/25 (~12%) under a 25-iteration
 * concurrent test -- better, but still a real, reproducible violation of
 * "cancelled AND approved must never both be true," caused by classic
 * Postgres write skew: this function's NOT EXISTS read of the payouts
 * table and approveApplication's funding-status EXISTS read of this task
 * row can each pass by reading around the other's not-yet-committed (or
 * just-committed-but-not-yet-visible-to-a-blocked-recheck) write, even
 * though neither one is stale by the time its own transaction commits.
 *
 * The explicit `SELECT ... FOR UPDATE` on this task's own row, now the
 * very first statement in this function's transaction, closes that gap.
 * approveApplication takes the identical lock on the identical row as
 * *its* first statement, so the two transactions now genuinely serialize
 * on this one row for their entire duration: whichever arrives first
 * holds the lock until it commits or rolls back, and the other blocks on
 * that SELECT itself rather than deep inside an UPDATE's WHERE-clause
 * recheck -- so every statement that runs after it unblocks, including
 * the NOT EXISTS clause below and approveApplication's own EXISTS clause,
 * sees a fully current, post-commit view. Nothing about the NOT EXISTS
 * clause itself changed; the lock was prepended in front of it, not a
 * replacement for it. Re-measured after adding the lock to both
 * functions: 0/25 invalid combinations (scripts/_lifecycle-verify.ts
 * scenario 10d). See approveApplication's own doc comment for the full
 * mechanism.
 */
export async function cancelTask(taskId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [lockedTask] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .for("update");

    if (!lockedTask) {
      return false;
    }

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
