"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import { MyTasksList } from "@/components/dashboard/MyTasksList";
import { StateCard } from "@/components/ui/StateCard";
import { Button } from "@/components/ui/Button";
import type { MyTask } from "@/types/application";

async function fetchMyTasks(): Promise<MyTask[]> {
  const response = await fetch("/api/applications");

  if (!response.ok) {
    throw new Error("Failed to load applications.");
  }

  const data = await response.json();
  return data.tasks as MyTask[];
}

// Mirrors MyTasksList's own Card-with-header, divided-row shape.
function MyTasksSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading applied tasks"
      className="rounded-xl border border-border bg-surface"
    >
      <span className="sr-only">Loading your applications…</span>
      <div aria-hidden="true">
        <div className="border-b border-border px-5 py-4">
          <div className="h-4 w-28 animate-pulse rounded bg-surface-muted" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex flex-col gap-2">
                <div className="h-4 w-44 animate-pulse rounded bg-surface-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-surface-muted" />
              </div>
              <div className="h-6 w-20 animate-pulse rounded-full bg-surface-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MyTasksContainer() {
  const { address, isConnected, isAuthenticated } = useWallet();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-tasks", address],
    queryFn: fetchMyTasks,
    enabled: isAuthenticated,
    // Tester release (Option A): a lightweight consistency net, not a
    // substitute for the evaluator -- active-tier evaluation is
    // synchronous and already resolved by the time the submit request
    // returns (see SubmitWorkButton's own invalidateQueries+router.refresh
    // right after a successful submit). This only covers the rare gap
    // where this specific tab wasn't the one that submitted (e.g. a second
    // open tab), and stops polling the moment nothing is actually pending.
    refetchInterval: (query) => {
      const tasks = query.state.data as MyTask[] | undefined;
      const hasPending = tasks?.some(
        (task) => task.hasSubmission && task.evaluationVerdict === null
      );
      return hasPending ? 5000 : false;
    },
  });

  if (!isConnected) {
    return (
      <StateCard
        title="Applied Tasks"
        message="Connect your wallet to see the tasks you've applied for."
        className="shadow-sm"
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <StateCard
        title="Applied Tasks"
        message="Sign in to see your tasks."
        className="shadow-sm"
      />
    );
  }

  if (isLoading) {
    return <MyTasksSkeleton />;
  }

  if (isError) {
    return (
      <StateCard
        title="Applied Tasks"
        message="We couldn't load your applications."
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

  return <MyTasksList tasks={data ?? []} />;
}
