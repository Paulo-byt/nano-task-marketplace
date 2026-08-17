import Link from "next/link";
import type { Task } from "@/types/task";
import { ConfirmApplicationButton } from "@/components/marketplace/ConfirmApplicationButton";

export function ApplyConfirmation({ task }: { task: Task }) {
  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Apply for this task
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Confirming creates a real application tied to your connected
          wallet address. No on-chain transaction or payment happens yet.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg bg-surface-muted p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Task</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {task.title}
          </p>
        </div>
        <p className="shrink-0 text-2xl font-bold text-primary sm:text-right">
          {task.rewardUsdc.toFixed(2)}{" "}
          <span className="text-sm font-medium text-zinc-500">USDC</span>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 border-y border-border py-5">
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Category
          </dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {task.category}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Est. Time
          </dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {task.estimatedTime}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3 sm:flex-row">
        <ConfirmApplicationButton
          taskId={task.id}
          fundingStatus={task.fundingStatus}
        />
        <Link
          href={`/marketplace/${task.id}`}
          className="inline-flex flex-1 items-center justify-center rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
