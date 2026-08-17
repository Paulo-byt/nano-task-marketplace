"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import { ProfileStats } from "@/components/dashboard/ProfileStats";
import { StateCard } from "@/components/ui/StateCard";
import { Button } from "@/components/ui/Button";
import type { ProfileOverview } from "@/types/dashboard";

const EMPTY_STATS: ProfileOverview = {
  memberSince: "—",
  tasksCompleted: 0,
  tasksInProgress: 0,
  reputationScore: 0,
};

async function fetchProfile(): Promise<{
  stats: ProfileOverview;
  totalEarningsUsdc: number;
}> {
  const response = await fetch("/api/profile");

  if (!response.ok) {
    throw new Error("Failed to load profile.");
  }

  return response.json();
}

// Mirrors ProfileStats' own 5-card grid shape.
function ProfileStatsSkeleton() {
  return (
    <div role="status" aria-label="Loading profile stats">
      <span className="sr-only">Loading your profile…</span>
      <div
        aria-hidden="true"
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
      >
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="h-3 w-20 animate-pulse rounded bg-surface-muted" />
            <div className="mt-3 h-7 w-14 animate-pulse rounded bg-surface-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileStatsContainer() {
  const { address, isConnected, isAuthenticated } = useWallet();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["profile", address],
    queryFn: fetchProfile,
    enabled: isAuthenticated,
  });

  if (!isConnected) {
    return (
      <StateCard
        message="Connect your wallet to see your profile stats."
        className="shadow-sm"
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <StateCard message="Sign in to see your profile stats." className="shadow-sm" />
    );
  }

  if (isLoading) {
    return <ProfileStatsSkeleton />;
  }

  if (isError) {
    return (
      <StateCard message="We couldn't load your profile." className="shadow-sm">
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </StateCard>
    );
  }

  return (
    <ProfileStats
      stats={data?.stats ?? EMPTY_STATS}
      totalEarningsUsdc={data?.totalEarningsUsdc ?? 0}
    />
  );
}
