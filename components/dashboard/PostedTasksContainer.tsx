"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import { PostedTasksList } from "@/components/dashboard/PostedTasksList";
import { StateCard } from "@/components/ui/StateCard";
import { Button } from "@/components/ui/Button";
import type { PostedTask } from "@/types/postedTask";

async function fetchPostedTasks(): Promise<PostedTask[]> {
  const response = await fetch("/api/tasks/posted");

  if (!response.ok) {
    throw new Error("Failed to load posted tasks.");
  }

  const data = await response.json();
  return data.tasks as PostedTask[];
}

// Mirrors PostedTasksList's own Card-with-header, sm:flex-row row shape.
function PostedTasksSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading posted tasks"
      className="rounded-xl border border-border bg-surface shadow-sm"
    >
      <span className="sr-only">Loading your posted tasks…</span>
      <div aria-hidden="true">
        <div className="border-b border-border px-5 py-4">
          <div className="h-4 w-28 animate-pulse rounded bg-surface-muted" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-2">
                <div className="h-4 w-44 animate-pulse rounded bg-surface-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-surface-muted" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-5 w-20 animate-pulse rounded-full bg-surface-muted" />
                <div className="h-4 w-16 animate-pulse rounded bg-surface-muted" />
                <div className="h-7 w-24 animate-pulse rounded-full bg-surface-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PostedTasksContainer() {
  const { address, isConnected, isAuthenticated } = useWallet();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["posted-tasks", address],
    queryFn: fetchPostedTasks,
    enabled: isAuthenticated,
  });

  if (!isConnected) {
    return (
      <StateCard
        title="Posted Tasks"
        message="Connect your wallet to see the tasks you've posted."
        className="shadow-sm"
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <StateCard
        title="Posted Tasks"
        message="Sign in to see your posted tasks."
        className="shadow-sm"
      />
    );
  }

  if (isLoading) {
    return <PostedTasksSkeleton />;
  }

  if (isError) {
    return (
      <StateCard
        title="Posted Tasks"
        message="We couldn't load your posted tasks."
        className="shadow-sm"
      >
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </StateCard>
    );
  }

  return <PostedTasksList tasks={data ?? []} />;
}
