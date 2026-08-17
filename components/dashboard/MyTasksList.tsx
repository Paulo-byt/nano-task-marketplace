import Link from "next/link";
import type { MyTask } from "@/types/application";
import { SubmitWorkButton } from "@/components/dashboard/SubmitWorkButton";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

type BadgeTone = "success" | "warning" | "error" | "neutral" | "info";

// Badge's fixed 5-tone system has no dedicated blue/violet -- "applied"
// reads as an in-progress/informational state (info), "completed" as a
// positive terminal state alongside "approved" (both success). The label
// text always accompanies the tone, so approved/completed sharing a tone
// stays distinguishable at a glance.
const STATUS_TONES: Record<MyTask["status"], BadgeTone> = {
  applied: "info",
  approved: "success",
  completed: "success",
  rejected: "error",
};

// Same tones PayoutHistory.tsx already uses for these exact statuses --
// one payout state must look the same everywhere it appears in the app.
const PAYOUT_STATUS_TONES: Record<NonNullable<MyTask["payoutStatus"]>, BadgeTone> = {
  completed: "success",
  pending: "warning",
  failed: "error",
  cancelled: "neutral",
  retrying: "warning",
};

const PAYOUT_STATUS_LABELS: Record<NonNullable<MyTask["payoutStatus"]>, string> = {
  completed: "Paid",
  pending: "Payment pending",
  failed: "Payment failed",
  cancelled: "Payment cancelled",
  retrying: "Payment retrying",
};

/**
 * 11D Step 4: disambiguates the one overloaded status, "rejected" -- see
 * getMyTasks' own doc comment (applicationsService.ts) for exactly which
 * signal is fully authoritative (payoutStatus === 'cancelled') versus
 * best-effort (taskFundingStatus === 'cancelled'). "applied"/"approved"/
 * "completed" are never ambiguous and pass through unchanged, still using
 * STATUS_TONES/the raw enum text exactly as before this step.
 */
function describeStatus(task: MyTask): { label: string; tone: BadgeTone } {
  if (task.status !== "rejected") {
    return { label: task.status, tone: STATUS_TONES[task.status] };
  }

  if (task.payoutStatus === "cancelled") {
    return { label: "Approval revoked", tone: STATUS_TONES.rejected };
  }

  if (task.taskFundingStatus === "cancelled") {
    return { label: "Task cancelled", tone: "neutral" };
  }

  return { label: "Not selected", tone: STATUS_TONES.rejected };
}

export function MyTasksList({ tasks }: { tasks: MyTask[] }) {
  return (
    <Card>
      <h2 className="border-b border-border px-5 py-4 text-sm font-semibold text-foreground">
        Applied Tasks
      </h2>

      {tasks.length > 0 ? (
        <ul className="divide-y divide-border">
          {tasks.map((task) => {
            const statusDisplay = describeStatus(task);
            const hasPaymentIssue =
              task.status === "approved" && task.payoutStatus === "failed";

            return (
              <li key={task.applicationId} className="flex flex-col gap-3 px-5 py-4">
                {/* flex-wrap + items-start (not flex-shrink-0 on the badge
                    group) mirrors ApplicantsList.tsx's own mobile fix: once
                    the badges/link/amount no longer fit beside the task
                    title, they drop to their own row instead of squeezing
                    the title down to a sliver. */}
                <div className="flex flex-wrap items-start justify-between gap-3">
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
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Badge tone={statusDisplay.tone}>{statusDisplay.label}</Badge>
                    <Badge
                      tone={
                        task.payoutStatus
                          ? PAYOUT_STATUS_TONES[task.payoutStatus]
                          : "neutral"
                      }
                    >
                      {task.payoutStatus
                        ? PAYOUT_STATUS_LABELS[task.payoutStatus]
                        : "No payout yet"}
                    </Badge>
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
                  <div className="rounded-lg border border-error/20 bg-error/5 px-3 py-2 text-xs text-error">
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
                  <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        Your submission
                      </span>
                      <Badge tone={task.isReviewed ? "success" : "info"}>
                        {task.isReviewed ? "Reviewed" : "Awaiting review"}
                      </Badge>
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
          No applications yet.{" "}
          <Link href="/marketplace" className="underline hover:text-foreground">
            Browse the marketplace
          </Link>{" "}
          to find your first task.
        </p>
      )}
    </Card>
  );
}
