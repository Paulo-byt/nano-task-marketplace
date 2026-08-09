import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, users } from "@/db/schema";
import type { Task } from "@/types/task";

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
