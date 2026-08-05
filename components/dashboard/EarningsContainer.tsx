"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import { EarningsSummaryGrid } from "@/components/dashboard/EarningsSummaryGrid";
import { PayoutHistory } from "@/components/dashboard/PayoutHistory";
import type { EarningsSummary, Payout } from "@/types/dashboard";

const EMPTY_SUMMARY: EarningsSummary = {
  totalEarningsUsdc: 0,
  availableBalanceUsdc: 0,
  pendingPayoutsUsdc: 0,
  completedPayoutsCount: 0,
};

async function fetchEarnings(
  wallet: string
): Promise<{ summary: EarningsSummary; payouts: Payout[] }> {
  const response = await fetch(
    `/api/earnings?wallet=${encodeURIComponent(wallet)}`
  );

  if (!response.ok) {
    throw new Error("Failed to load earnings.");
  }

  return response.json();
}

function StateCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10">
      <h2 className="border-b border-black/10 px-5 py-4 text-sm font-semibold text-foreground dark:border-white/10">
        Earnings
      </h2>
      <p className="px-5 py-8 text-center text-sm text-zinc-500">
        {message}
      </p>
    </div>
  );
}

export function EarningsContainer() {
  const { address, isConnected } = useWallet();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["earnings", address],
    queryFn: () => fetchEarnings(address as string),
    enabled: isConnected && Boolean(address),
  });

  if (!isConnected || !address) {
    return <StateCard message="Connect your wallet to see your earnings." />;
  }

  if (isLoading) {
    return <StateCard message="Loading your earnings…" />;
  }

  if (isError) {
    return (
      <StateCard message="Couldn't load your earnings. Try refreshing the page." />
    );
  }

  return (
    <>
      <EarningsSummaryGrid summary={data?.summary ?? EMPTY_SUMMARY} />
      <PayoutHistory payouts={data?.payouts ?? []} />
    </>
  );
}
