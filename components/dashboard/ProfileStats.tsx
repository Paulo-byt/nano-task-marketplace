import type { ProfileOverview } from "@/types/dashboard";
import { SummaryCard } from "@/components/dashboard/SummaryCard";

interface ProfileStatsProps {
  stats: ProfileOverview;
  totalEarningsUsdc: number;
}

export function ProfileStats({ stats, totalEarningsUsdc }: ProfileStatsProps) {
  const cards = [
    { label: "Member Since", value: stats.memberSince, tone: "neutral" as const },
    {
      label: "Tasks Completed",
      value: stats.tasksCompleted.toString(),
      tone: "success" as const,
    },
    {
      label: "Tasks In Progress",
      value: stats.tasksInProgress.toString(),
      tone: "warning" as const,
    },
    {
      label: "Reputation",
      value: `${stats.reputationScore.toFixed(1)} / 5.0`,
      tone: "primary" as const,
    },
    {
      label: "Total Earnings",
      value: `${totalEarningsUsdc.toFixed(2)} USDC`,
      tone: "primary" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
