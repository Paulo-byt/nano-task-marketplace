import type { Payout } from "@/types/dashboard";

const STATUS_STYLES: Record<Payout["status"], string> = {
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function PayoutHistory({ payouts }: { payouts: Payout[] }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10">
      <h2 className="border-b border-black/10 px-5 py-4 text-sm font-semibold text-foreground dark:border-white/10">
        Payout History
      </h2>

      {payouts.length > 0 ? (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {payouts.map((payout) => (
            <li
              key={payout.id}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {payout.taskTitle}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">{payout.date}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLES[payout.status]}`}
                >
                  {payout.status}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {payout.amountUsdc.toFixed(2)} USDC
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-zinc-500">
          No payouts yet.
        </p>
      )}
    </div>
  );
}
