import Link from "next/link";
import type { Task } from "@/types/task";
import { ConfirmApplicationButton } from "@/components/marketplace/ConfirmApplicationButton";

export function ApplyConfirmation({ task }: { task: Task }) {
  return (
    <div className="flex flex-col gap-6 rounded-xl border border-black/10 bg-background p-6 dark:border-white/10 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Apply for this task
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Confirming creates a real application in the database. Wallet-based
          sign-in and on-chain payment aren&apos;t wired up yet, so this uses
          a temporary demo identity behind the scenes.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 border-y border-black/10 py-5 dark:border-white/10 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Task
          </dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {task.title}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Reward
          </dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {task.rewardUsdc.toFixed(2)} USDC
          </dd>
        </div>
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
        <ConfirmApplicationButton taskId={task.id} />
        <Link
          href={`/marketplace/${task.id}`}
          className="inline-flex flex-1 items-center justify-center rounded-full border border-black/10 px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
