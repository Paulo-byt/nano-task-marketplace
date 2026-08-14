import type { Payout } from "@/types/dashboard";

const STATUS_STYLES: Record<Payout["status"], string> = {
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  retrying: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
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
              id={`payout-${payout.id}`}
              // 11D Step 6: the anchor target My Tasks' "View payout" link
              // (MyTasksList.tsx) points at. target: is a plain CSS
              // pseudo-class match on the URL fragment -- no JS, no new
              // state -- so landing here from that link is visually
              // obvious for a moment, then fades back to the normal row.
              className="flex items-center justify-between gap-4 px-5 py-4 target:bg-emerald-500/[0.06] target:ring-1 target:ring-inset target:ring-emerald-500/30"
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
