import { eq } from "drizzle-orm";
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
