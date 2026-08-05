import { EarningsContainer } from "@/components/dashboard/EarningsContainer";

export default function EarningsPage() {
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

      <EarningsContainer />
    </div>
  );
}
