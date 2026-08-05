import Link from "next/link";
import type { Task } from "@/types/task";

const DIFFICULTY_STYLES: Record<Task["difficulty"], string> = {
  Beginner: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Intermediate: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Advanced: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const PLACEHOLDER_REQUIREMENTS = [
  "Complete the task exactly as described",
  "Submit proof of completion for review",
  "Payment is released automatically upon approval",
];

export function TaskDetails({ task }: { task: Task }) {
  return (
    <article className="flex flex-col gap-6 rounded-xl border border-black/10 bg-background p-6 dark:border-white/10 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
          {task.category}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${DIFFICULTY_STYLES[task.difficulty]}`}
        >
          {task.difficulty}
        </span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {task.title}
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
          {task.description}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 border-y border-black/10 py-5 dark:border-white/10 sm:grid-cols-4">
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
            Est. Time
          </dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {task.estimatedTime}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Creator
          </dt>
          <dd className="mt-1 truncate text-sm font-semibold text-foreground">
            {task.creator}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Deadline
          </dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            Not yet set
          </dd>
        </div>
      </dl>

      <div>
        <h2 className="text-sm font-semibold text-foreground">
          Requirements
        </h2>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          {PLACEHOLDER_REQUIREMENTS.map((requirement) => (
            <li key={requirement} className="flex gap-2">
              <span aria-hidden="true">•</span>
              {requirement}
            </li>
          ))}
        </ul>
      </div>

      <Link
        href={`/marketplace/${task.id}/apply`}
        className="inline-flex w-full items-center justify-center rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:opacity-90 sm:w-auto sm:self-start"
      >
        Apply
      </Link>
    </article>
  );
}
