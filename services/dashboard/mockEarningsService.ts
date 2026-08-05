import type { EarningsSummary, Payout } from "@/types/dashboard";

const MOCK_EARNINGS_SUMMARY: EarningsSummary = {
  totalEarningsUsdc: 18.95,
  availableBalanceUsdc: 12.7,
  pendingPayoutsUsdc: 6.25,
  completedPayoutsCount: 5,
};

const MOCK_PAYOUTS: Payout[] = [
  {
    id: "payout-1",
    taskTitle: "Write a 100-word product description",
    amountUsdc: 0.75,
    status: "completed",
    date: "Aug 3, 2026",
  },
  {
    id: "payout-2",
    taskTitle: "Label 50 images for model training",
    amountUsdc: 1.2,
    status: "completed",
    date: "Aug 2, 2026",
  },
  {
    id: "payout-3",
    taskTitle: "Share and screenshot a campaign post",
    amountUsdc: 0.25,
    status: "completed",
    date: "Jul 31, 2026",
  },
  {
    id: "payout-4",
    taskTitle: "Proofread a blog post for grammar",
    amountUsdc: 0.5,
    status: "completed",
    date: "Jul 29, 2026",
  },
  {
    id: "payout-5",
    taskTitle: "Rate chatbot responses for helpfulness",
    amountUsdc: 2.0,
    status: "completed",
    date: "Jul 26, 2026",
  },
  {
    id: "payout-6",
    taskTitle: "Summarize 3 competitor pricing pages",
    amountUsdc: 3.5,
    status: "pending",
    date: "Aug 4, 2026",
  },
  {
    id: "payout-7",
    taskTitle: "Find 10 verified sources on a topic",
    amountUsdc: 2.75,
    status: "pending",
    date: "Aug 4, 2026",
  },
];

export function getEarningsSummary(): EarningsSummary {
  return MOCK_EARNINGS_SUMMARY;
}

export function getPayoutHistory(): Payout[] {
  return MOCK_PAYOUTS;
}
