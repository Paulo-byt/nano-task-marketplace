"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import { MyTasksList } from "@/components/dashboard/MyTasksList";
import type { MyTask } from "@/types/application";

async function fetchMyTasks(wallet: string): Promise<MyTask[]> {
  const response = await fetch(
    `/api/applications?wallet=${encodeURIComponent(wallet)}`
  );

  if (!response.ok) {
    throw new Error("Failed to load applications.");
  }

  const data = await response.json();
  return data.tasks as MyTask[];
}

function StateCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10">
      <h2 className="border-b border-black/10 px-5 py-4 text-sm font-semibold text-foreground dark:border-white/10">
        Applied Tasks
      </h2>
      <p className="px-5 py-8 text-center text-sm text-zinc-500">
        {message}
      </p>
    </div>
  );
}

export function MyTasksContainer() {
  const { address, isConnected } = useWallet();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-tasks", address],
    queryFn: () => fetchMyTasks(address as string),
    enabled: isConnected && Boolean(address),
  });

  if (!isConnected || !address) {
    return (
      <StateCard message="Connect your wallet to see the tasks you've applied for." />
    );
  }

  if (isLoading) {
    return <StateCard message="Loading your applications…" />;
  }

  if (isError) {
    return (
      <StateCard message="Couldn't load your applications. Try refreshing the page." />
    );
  }

  return <MyTasksList tasks={data ?? []} />;
}
