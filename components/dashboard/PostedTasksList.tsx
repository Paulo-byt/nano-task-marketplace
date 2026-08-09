import Link from "next/link";
import type { PostedTask } from "@/types/postedTask";

const FUNDING_STATUS_STYLES: Record<PostedTask["fundingStatus"], string> = {
  unfunded: "bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-400",
  funded: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  released: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const FUNDING_STATUS_LABELS: Record<PostedTask["fundingStatus"], string> = {
  unfunded: "Not yet funded",
  funded: "Funded",
  released: "Funded",
  cancelled: "Cancelled",
};

export function PostedTasksList({ tasks }: { tasks: PostedTask[] }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10">
      <h2 className="border-b border-black/10 px-5 py-4 text-sm font-semibold text-foreground dark:border-white/10">
        Posted Tasks
      </h2>

      {tasks.length > 0 ? (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <Link
                  href={`/marketplace/${task.id}`}
                  className="truncate text-sm font-medium text-foreground hover:underline"
                >
                  {task.title}
                </Link>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Posted {task.createdAt} · {task.category} · {task.difficulty}
                </p>
              </div>
              <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${FUNDING_STATUS_STYLES[task.fundingStatus]}`}
                >
                  {FUNDING_STATUS_LABELS[task.fundingStatus]}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {task.rewardUsdc.toFixed(2)} USDC
                </span>
                <Link
                  href={`/dashboard/posted-tasks/${task.id}/applicants`}
                  className="inline-flex items-center justify-center rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                >
                  Applicants ({task.applicantCount})
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-zinc-500">
          You haven&apos;t posted any tasks yet.{" "}
          <Link
            href="/marketplace/new"
            className="underline hover:text-foreground"
          >
            Post your first task
          </Link>
          .
        </p>
      )}
    </div>
  );
}
