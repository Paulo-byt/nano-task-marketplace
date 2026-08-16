import Link from "next/link";
import type { Task } from "@/types/task";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const DIFFICULTY_TONES: Record<Task["difficulty"], "success" | "warning" | "error"> = {
  Beginner: "success",
  Intermediate: "warning",
  Advanced: "error",
};

export function TaskCard({ task }: { task: Task }) {
  return (
    <Card className="flex h-full flex-col gap-3 p-5 shadow-sm transition-shadow hover:shadow-md">
      <Link
        href={`/marketplace/${task.id}`}
        aria-label={`View details for ${task.title}`}
        className="flex flex-1 flex-col gap-3"
      >
        <h3 className="text-base font-semibold text-foreground">
          {task.title}
        </h3>

        <p className="text-2xl font-bold text-primary">
          {task.rewardUsdc.toFixed(2)}{" "}
          <span className="text-sm font-medium text-zinc-500">USDC</span>
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={DIFFICULTY_TONES[task.difficulty]}>
            {task.difficulty}
          </Badge>
          <span className="text-xs text-zinc-500">{task.estimatedTime}</span>
          <Badge tone="neutral">{task.category}</Badge>
        </div>

        <p className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
          {task.description}
        </p>
      </Link>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="truncate text-xs text-zinc-500">{task.creator}</span>
        <Button href={`/marketplace/${task.id}/apply`} variant="brand" size="sm">
          Apply
        </Button>
      </div>
    </Card>
  );
}
