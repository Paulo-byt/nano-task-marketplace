"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import { SummaryCardsGrid } from "@/components/dashboard/SummaryCardsGrid";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import type { ActivityItem, DashboardSummary } from "@/types/dashboard";

const EMPTY_SUMMARY: DashboardSummary = {
  appliedTasks: 0,
  completedTasks: 0,
  pendingTasks: 0,
  totalEarningsUsdc: 0,
};

async function fetchDashboard(): Promise<{
  summary: DashboardSummary;
  activity: ActivityItem[];
}> {
  const response = await fetch("/api/dashboard");

  if (!response.ok) {
    throw new Error("Failed to load dashboard.");
  }

  return response.json();
}

function StateCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-black/10 p-5 dark:border-white/10">
      <p className="text-sm text-zinc-500">{message}</p>
    </div>
  );
}

export function DashboardOverviewContainer() {
  const { address, isConnected, isAuthenticated } = useWallet();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", address],
    queryFn: fetchDashboard,
    enabled: isAuthenticated,
  });

  if (!isConnected) {
    return <StateCard message="Connect your wallet to see your dashboard." />;
  }

  if (!isAuthenticated) {
    return <StateCard message="Sign in to see your dashboard." />;
  }

  if (isLoading) {
    return <StateCard message="Loading your dashboard…" />;
  }

  if (isError) {
    return (
      <StateCard message="Couldn't load your dashboard. Try refreshing the page." />
    );
  }

  return (
    <>
      <SummaryCardsGrid summary={data?.summary ?? EMPTY_SUMMARY} />
      <RecentActivity activity={data?.activity ?? []} />
    </>
  );
}
