import Link from "next/link";
import type { MyTask } from "@/types/application";

const STATUS_STYLES: Record<MyTask["status"], string> = {
  applied: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  completed: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export function MyTasksList({ tasks }: { tasks: MyTask[] }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10">
      <h2 className="border-b border-black/10 px-5 py-4 text-sm font-semibold text-foreground dark:border-white/10">
        Applied Tasks
      </h2>

      {tasks.length > 0 ? (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {tasks.map((task) => (
            <li
              key={task.applicationId}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div className="min-w-0">
                <Link
                  href={`/marketplace/${task.taskId}`}
                  className="truncate text-sm font-medium text-foreground hover:underline"
                >
                  {task.taskTitle}
                </Link>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Applied {task.appliedAt}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLES[task.status]}`}
                >
                  {task.status}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {task.rewardUsdc.toFixed(2)} USDC
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-zinc-500">
          No applications yet. Browse the marketplace to find your first
          task.
        </p>
      )}
    </div>
  );
}
