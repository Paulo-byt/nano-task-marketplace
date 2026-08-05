import type { ActivityItem, DashboardSummary } from "@/types/dashboard";

const MOCK_DASHBOARD_SUMMARY: DashboardSummary = {
  appliedTasks: 5,
  completedTasks: 12,
  pendingTasks: 2,
  totalEarningsUsdc: 18.45,
};

const MOCK_RECENT_ACTIVITY: ActivityItem[] = [
  {
    id: "activity-1",
    type: "payment",
    description:
      'Received payment for "Write a 100-word product description"',
    timestamp: "2 hours ago",
  },
  {
    id: "activity-2",
    type: "completed",
    description: 'Completed "Label 50 images for model training"',
    timestamp: "5 hours ago",
  },
  {
    id: "activity-3",
    type: "applied",
    description: 'Applied for "Summarize 3 competitor pricing pages"',
    timestamp: "Yesterday",
  },
  {
    id: "activity-4",
    type: "payment",
    description: 'Received payment for "Share and screenshot a campaign post"',
    timestamp: "2 days ago",
  },
  {
    id: "activity-5",
    type: "applied",
    description: 'Applied for "Proofread a blog post for grammar"',
    timestamp: "3 days ago",
  },
];

export function getDashboardSummary(): DashboardSummary {
  return MOCK_DASHBOARD_SUMMARY;
}

export function getRecentActivity(): ActivityItem[] {
  return MOCK_RECENT_ACTIVITY;
}
