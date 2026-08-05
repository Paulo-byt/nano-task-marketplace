import {
  getEarningsSummary,
  getPayoutHistory,
} from "@/services/dashboard/mockEarningsService";
import { EarningsSummaryGrid } from "@/components/dashboard/EarningsSummaryGrid";
import { PayoutHistory } from "@/components/dashboard/PayoutHistory";

export default function EarningsPage() {
  const summary = getEarningsSummary();
  const payouts = getPayoutHistory();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Earnings
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Track your USDC earnings and payout history.
        </p>
      </div>

      <EarningsSummaryGrid summary={summary} />
      <PayoutHistory payouts={payouts} />
    </div>
  );
}
