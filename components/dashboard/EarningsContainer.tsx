"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import { EarningsSummaryGrid } from "@/components/dashboard/EarningsSummaryGrid";
import { PayoutHistory } from "@/components/dashboard/PayoutHistory";
import { StateCard } from "@/components/ui/StateCard";
import { Button } from "@/components/ui/Button";
import type { EarningsSummary, Payout } from "@/types/dashboard";

const EMPTY_SUMMARY: EarningsSummary = {
  totalEarningsUsdc: 0,
  availableBalanceUsdc: 0,
  pendingPayoutsUsdc: 0,
  completedPayoutsCount: 0,
};

async function fetchEarnings(): Promise<{
  summary: EarningsSummary;
  payouts: Payout[];
}> {
  const response = await fetch("/api/earnings");

  if (!response.ok) {
    throw new Error("Failed to load earnings.");
  }

  return response.json();
}

// Mirrors EarningsSummaryGrid's 4-card grid and PayoutHistory's header +
// row shape, so the page doesn't visibly jump once real data arrives.
function EarningsSkeleton() {
  return (
    <div role="status" aria-label="Loading earnings">
      <span className="sr-only">Loading earnings…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border bg-surface p-5">
              <div className="h-3 w-20 animate-pulse rounded bg-surface-muted" />
              <div className="mt-3 h-7 w-16 animate-pulse rounded bg-surface-muted" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <div className="h-4 w-28 animate-pulse rounded bg-surface-muted" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex flex-col gap-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-surface-muted" />
                  <div className="h-3 w-24 animate-pulse rounded bg-surface-muted" />
                </div>
                <div className="h-6 w-20 animate-pulse rounded-full bg-surface-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EarningsContainer() {
  const { address, isConnected, isAuthenticated } = useWallet();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["earnings", address],
    queryFn: fetchEarnings,
    enabled: isAuthenticated,
  });

  if (!isConnected) {
    return (
      <StateCard
        title="Earnings"
        message="Connect your wallet to see your earnings."
        className="shadow-sm"
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <StateCard
        title="Earnings"
        message="Sign in to see your earnings."
        className="shadow-sm"
      />
    );
  }

  if (isLoading) {
    return <EarningsSkeleton />;
  }

  if (isError) {
    return (
      <StateCard title="Earnings" message="We couldn't load your earnings." className="shadow-sm">
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
      <EarningsSummaryGrid summary={data?.summary ?? EMPTY_SUMMARY} />
      <PayoutHistory payouts={data?.payouts ?? []} />
    </>
  );
}
