import Link from "next/link";
import type { PostedTask } from "@/types/postedTask";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CancelTaskButton } from "@/components/dashboard/CancelTaskButton";

const FUNDING_STATUS_TONES: Record<
  PostedTask["fundingStatus"],
  "success" | "error" | "neutral"
> = {
  unfunded: "neutral",
  funded: "success",
  released: "success",
  cancelled: "error",
};

const FUNDING_STATUS_LABELS: Record<PostedTask["fundingStatus"], string> = {
  unfunded: "Not yet funded",
  funded: "Funded",
  released: "Funded",
  cancelled: "Cancelled",
};

export function PostedTasksList({ tasks }: { tasks: PostedTask[] }) {
  return (
    <Card>
      <h2 className="border-b border-border px-5 py-4 text-sm font-semibold text-foreground">
        Posted Tasks
      </h2>

      {tasks.length > 0 ? (
        <ul className="divide-y divide-border">
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
                <Badge tone={FUNDING_STATUS_TONES[task.fundingStatus]}>
                  {FUNDING_STATUS_LABELS[task.fundingStatus]}
                </Badge>
                <span className="text-base font-semibold text-primary">
                  {task.rewardUsdc.toFixed(2)} USDC
                </span>
                <Button
                  href={`/dashboard/posted-tasks/${task.id}/applicants`}
                  variant="secondary"
                  size="sm"
                >
                  Applicants ({task.applicantCount})
                </Button>
                {(task.fundingStatus === "unfunded" ||
                  task.fundingStatus === "funded") && (
                  <CancelTaskButton taskId={task.id} />
                )}
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
    </Card>
  );
}
