import Link from "next/link";
import type { MyTask } from "@/types/application";
import { SubmitWorkButton } from "@/components/dashboard/SubmitWorkButton";

const STATUS_STYLES: Record<MyTask["status"], string> = {
  applied: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  completed: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
};

// Same colors PayoutHistory.tsx already uses for these exact statuses --
// one payout state must look the same everywhere it appears in the app.
const PAYOUT_STATUS_STYLES: Record<NonNullable<MyTask["payoutStatus"]>, string> = {
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  retrying: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

const PAYOUT_STATUS_LABELS: Record<NonNullable<MyTask["payoutStatus"]>, string> = {
  completed: "Paid",
  pending: "Payment pending",
  failed: "Payment failed",
  cancelled: "Payment cancelled",
  retrying: "Payment retrying",
};

// No payout row exists at all yet -- deliberately styled differently from
// "cancelled" above (bg-zinc), even though both read as neutral/muted, so
// "nothing has happened yet" is never visually confusable with "a payout
// existed and was reversed."
const NO_PAYOUT_STYLE = "bg-black/5 text-zinc-500 dark:bg-white/10 dark:text-zinc-400";

/**
 * 11D Step 4: disambiguates the one overloaded status, "rejected" -- see
 * getMyTasks' own doc comment (applicationsService.ts) for exactly which
 * signal is fully authoritative (payoutStatus === 'cancelled') versus
 * best-effort (taskFundingStatus === 'cancelled'). "applied"/"approved"/
 * "completed" are never ambiguous and pass through unchanged, still using
 * STATUS_STYLES/the raw enum text exactly as before this step.
 */
function describeStatus(task: MyTask): { label: string; style: string } {
  if (task.status !== "rejected") {
    return { label: task.status, style: STATUS_STYLES[task.status] };
  }

  if (task.payoutStatus === "cancelled") {
    return { label: "Approval revoked", style: STATUS_STYLES.rejected };
  }

  if (task.taskFundingStatus === "cancelled") {
    return {
      label: "Task cancelled",
      style: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
    };
  }

  return { label: "Not selected", style: STATUS_STYLES.rejected };
}

export function MyTasksList({ tasks }: { tasks: MyTask[] }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10">
      <h2 className="border-b border-black/10 px-5 py-4 text-sm font-semibold text-foreground dark:border-white/10">
        Applied Tasks
      </h2>

      {tasks.length > 0 ? (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {tasks.map((task) => {
            const statusDisplay = describeStatus(task);
            const hasPaymentIssue =
              task.status === "approved" && task.payoutStatus === "failed";

            return (
              <li key={task.applicationId} className="flex flex-col gap-3 px-5 py-4">
                <div className="flex items-center justify-between gap-4">
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
                  <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusDisplay.style}`}
                    >
                      {statusDisplay.label}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        task.payoutStatus
                          ? PAYOUT_STATUS_STYLES[task.payoutStatus]
                          : NO_PAYOUT_STYLE
                      }`}
                    >
                      {task.payoutStatus
                        ? PAYOUT_STATUS_LABELS[task.payoutStatus]
                        : "No payout yet"}
                    </span>
                    {task.payoutId && (
                      // 11D Step 6: only rendered once a real payout row
                      // exists -- never a link for "No payout yet," and
                      // never implying completion, since the badge right
                      // beside it already carries the real, unmodified
                      // status regardless of where this points.
                      <Link
                        href={`/dashboard/earnings#payout-${task.payoutId}`}
                        className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        View payout
                      </Link>
                    )}
                    <span className="text-sm font-semibold text-foreground">
                      {task.rewardUsdc.toFixed(2)} USDC
                    </span>
                  </div>
                </div>
                {hasPaymentIssue && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/[0.03] px-3 py-2 text-xs text-red-700 dark:border-red-500/20 dark:text-red-400">
                    <span className="font-medium">Payment issue: </span>
                    Your work was approved, but the payout needs to be
                    retried by the task creator.
                  </div>
                )}
                {task.status === "approved" && !task.hasSubmission && (
                  <SubmitWorkButton
                    taskId={task.taskId}
                    applicationId={task.applicationId}
                  />
                )}
                {task.hasSubmission && (
                  <div className="rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-zinc-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-400">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        Your submission
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          task.isReviewed
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {task.isReviewed ? "Reviewed" : "Awaiting review"}
                      </span>
                    </div>
                    {task.submissionContent}
                  </div>
                )}
              </li>
            );
          })}
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
