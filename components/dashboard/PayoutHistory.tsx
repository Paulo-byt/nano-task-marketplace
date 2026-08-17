import type { Payout } from "@/types/dashboard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

// Same tones MyTasksList.tsx already uses for these exact statuses -- one
// payout state must look the same everywhere it appears in the app.
const STATUS_TONES: Record<Payout["status"], "success" | "warning" | "error" | "neutral"> = {
  completed: "success",
  pending: "warning",
  failed: "error",
  cancelled: "neutral",
  retrying: "warning",
};

export function PayoutHistory({ payouts }: { payouts: Payout[] }) {
  return (
    <Card className="shadow-sm">
      <h2 className="border-b border-border px-5 py-4 text-sm font-semibold text-foreground">
        Payout History
      </h2>

      {payouts.length > 0 ? (
        <ul className="divide-y divide-border">
          {payouts.map((payout) => (
            <li
              key={payout.id}
              id={`payout-${payout.id}`}
              // 11D Step 6: the anchor target My Tasks' "View payout" link
              // (MyTasksList.tsx) points at. target: is a plain CSS
              // pseudo-class match on the URL fragment -- no JS, no new
              // state -- so landing here from that link is visually
              // obvious for a moment, then fades back to the normal row.
              className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 target:bg-success/[0.06] target:ring-1 target:ring-inset target:ring-success/30"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {payout.taskTitle}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">{payout.date}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={STATUS_TONES[payout.status]} className="capitalize">
                  {payout.status}
                </Badge>
                <span className="text-base font-semibold text-primary">
                  {payout.amountUsdc.toFixed(2)} USDC
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-zinc-500">
          No payouts yet. Completed work shows up here once it&apos;s paid.
        </p>
      )}
    </Card>
  );
}
