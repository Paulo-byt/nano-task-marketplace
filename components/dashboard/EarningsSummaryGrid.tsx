import type { EarningsSummary } from "@/types/dashboard";
import { SummaryCard } from "@/components/dashboard/SummaryCard";

export function EarningsSummaryGrid({
  summary,
}: {
  summary: EarningsSummary;
}) {
  const cards = [
    {
      label: "Total Earnings",
      value: `${summary.totalEarningsUsdc.toFixed(2)} USDC`,
      tone: "primary" as const,
    },
    {
      label: "Available Balance",
      value: `${summary.availableBalanceUsdc.toFixed(2)} USDC`,
      tone: "success" as const,
    },
    {
      label: "Pending Payouts",
      value: `${summary.pendingPayoutsUsdc.toFixed(2)} USDC`,
      tone: "warning" as const,
    },
    {
      label: "Completed Payouts",
      value: summary.completedPayoutsCount.toString(),
      tone: "neutral" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((card) => (
        <SummaryCard
          key={card.label}
          label={card.label}
          value={card.value}
          tone={card.tone}
        />
      ))}
    </div>
  );
}
