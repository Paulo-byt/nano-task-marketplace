import Link from "next/link";
import type { Task } from "@/types/task";

const DIFFICULTY_STYLES: Record<Task["difficulty"], string> = {
  Beginner: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Intermediate: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Advanced: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export function TaskCard({ task }: { task: Task }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-black/10 bg-background p-5 transition-colors hover:border-black/20 dark:border-white/10 dark:hover:border-white/20">
      <Link
        href={`/marketplace/${task.id}`}
        aria-label={`View details for ${task.title}`}
        className="flex flex-1 flex-col gap-3"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
            {task.category}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${DIFFICULTY_STYLES[task.difficulty]}`}
          >
            {task.difficulty}
          </span>
        </div>

        <h3 className="text-base font-semibold text-foreground">
          {task.title}
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {task.description}
        </p>

        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-zinc-500 dark:text-zinc-500">
          <span>{task.estimatedTime}</span>
          <span className="truncate">{task.creator}</span>
        </div>
      </Link>

      <div className="flex items-center justify-between gap-3 border-t border-black/10 pt-3 dark:border-white/10">
        <span className="text-base font-semibold text-foreground">
          {task.rewardUsdc.toFixed(2)}{" "}
          <span className="text-xs font-normal text-zinc-500">USDC</span>
        </span>
        <Link
          href={`/marketplace/${task.id}/apply`}
          className="inline-flex items-center justify-center rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:opacity-90"
        >
          Apply
        </Link>
      </div>
    </div>
  );
}
