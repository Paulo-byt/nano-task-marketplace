"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import { PostedTasksList } from "@/components/dashboard/PostedTasksList";
import type { PostedTask } from "@/types/postedTask";

async function fetchPostedTasks(): Promise<PostedTask[]> {
  const response = await fetch("/api/tasks/posted");

  if (!response.ok) {
    throw new Error("Failed to load posted tasks.");
  }

  const data = await response.json();
  return data.tasks as PostedTask[];
}

function StateCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10">
      <h2 className="border-b border-black/10 px-5 py-4 text-sm font-semibold text-foreground dark:border-white/10">
        Posted Tasks
      </h2>
      <p className="px-5 py-8 text-center text-sm text-zinc-500">
        {message}
      </p>
    </div>
  );
}

export function PostedTasksContainer() {
  const { address, isConnected, isAuthenticated } = useWallet();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["posted-tasks", address],
    queryFn: fetchPostedTasks,
    enabled: isAuthenticated,
  });

  if (!isConnected) {
    return (
      <StateCard message="Connect your wallet to see the tasks you've posted." />
    );
  }

  if (!isAuthenticated) {
    return <StateCard message="Sign in to see your posted tasks." />;
  }

  if (isLoading) {
    return <StateCard message="Loading your posted tasks…" />;
  }

  if (isError) {
    return (
      <StateCard message="Couldn't load your posted tasks. Try refreshing the page." />
    );
  }

  return <PostedTasksList tasks={data ?? []} />;
}
