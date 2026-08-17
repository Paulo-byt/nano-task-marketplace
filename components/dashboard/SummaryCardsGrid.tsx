import type { DashboardSummary } from "@/types/dashboard";
import { SummaryCard } from "@/components/dashboard/SummaryCard";

export function SummaryCardsGrid({ summary }: { summary: DashboardSummary }) {
  const cards = [
    {
      label: "Applied Tasks",
      value: summary.appliedTasks.toString(),
      tone: "neutral" as const,
    },
    {
      label: "Completed Tasks",
      value: summary.completedTasks.toString(),
      tone: "success" as const,
    },
    {
      label: "Pending Tasks",
      value: summary.pendingTasks.toString(),
      tone: "warning" as const,
    },
    {
      label: "Total Earnings",
      value: `${summary.totalEarningsUsdc.toFixed(2)} USDC`,
      tone: "primary" as const,
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
