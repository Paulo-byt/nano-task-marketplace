"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import { SummaryCardsGrid } from "@/components/dashboard/SummaryCardsGrid";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { StateCard } from "@/components/ui/StateCard";
import { Button } from "@/components/ui/Button";
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

// Mirrors SummaryCardsGrid's 4-card grid and RecentActivity's dotted-row
// shape.
function DashboardOverviewSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <span className="sr-only">Loading your dashboard…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border bg-surface p-5">
              <div className="h-3 w-20 animate-pulse rounded bg-surface-muted" />
              <div className="mt-3 h-7 w-12 animate-pulse rounded bg-surface-muted" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="h-4 w-32 animate-pulse rounded bg-surface-muted" />
          <div className="mt-4 flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-surface-muted" />
                <div className="flex-1">
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-surface-muted" />
                  <div className="mt-1.5 h-3 w-16 animate-pulse rounded bg-surface-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardOverviewContainer() {
  const { address, isConnected, isAuthenticated } = useWallet();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard", address],
    queryFn: fetchDashboard,
    enabled: isAuthenticated,
  });

  if (!isConnected) {
    return (
      <StateCard
        message="Connect your wallet to see your dashboard."
        className="shadow-sm"
      />
    );
  }

  if (!isAuthenticated) {
    return <StateCard message="Sign in to see your dashboard." className="shadow-sm" />;
  }

  if (isLoading) {
    return <DashboardOverviewSkeleton />;
  }

  if (isError) {
    return (
      <StateCard message="We couldn't load your dashboard." className="shadow-sm">
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </StateCard>
    );
  }

  return (
    <>
      <SummaryCardsGrid summary={data?.summary ?? EMPTY_SUMMARY} />
      <RecentActivity activity={data?.activity ?? []} />
    </>
  );
}
