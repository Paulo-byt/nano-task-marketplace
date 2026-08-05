"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import { ProfileStats } from "@/components/dashboard/ProfileStats";
import type { ProfileOverview } from "@/types/dashboard";

const EMPTY_STATS: ProfileOverview = {
  memberSince: "—",
  tasksCompleted: 0,
  tasksInProgress: 0,
  reputationScore: 0,
};

async function fetchProfile(
  wallet: string
): Promise<{ stats: ProfileOverview; totalEarningsUsdc: number }> {
  const response = await fetch(
    `/api/profile?wallet=${encodeURIComponent(wallet)}`
  );

  if (!response.ok) {
    throw new Error("Failed to load profile.");
  }

  return response.json();
}

function StateCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-black/10 p-5 text-center text-sm text-zinc-500 dark:border-white/10">
      {message}
    </div>
  );
}

export function ProfileStatsContainer() {
  const { address, isConnected } = useWallet();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["profile", address],
    queryFn: () => fetchProfile(address as string),
    enabled: isConnected && Boolean(address),
  });

  if (!isConnected || !address) {
    return (
      <StateCard message="Connect your wallet to see your profile stats." />
    );
  }

  if (isLoading) {
    return <StateCard message="Loading your profile…" />;
  }

  if (isError) {
    return (
      <StateCard message="Couldn't load your profile. Try refreshing the page." />
    );
  }

  return (
    <ProfileStats
      stats={data?.stats ?? EMPTY_STATS}
      totalEarningsUsdc={data?.totalEarningsUsdc ?? 0}
    />
  );
}
