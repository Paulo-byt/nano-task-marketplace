export interface DashboardSummary {
  appliedTasks: number;
  completedTasks: number;
  pendingTasks: number;
  totalEarningsUsdc: number;
}

export interface ActivityItem {
  id: string;
  type: "applied" | "completed" | "payment";
  description: string;
  timestamp: string;
}

export interface EarningsSummary {
  totalEarningsUsdc: number;
  availableBalanceUsdc: number;
  pendingPayoutsUsdc: number;
  completedPayoutsCount: number;
}

export interface Payout {
  id: string;
  taskTitle: string;
  amountUsdc: number;
  status: "completed" | "pending" | "failed" | "cancelled";
  date: string;
}

export interface ProfileOverview {
  memberSince: string;
  tasksCompleted: number;
  tasksInProgress: number;
  reputationScore: number;
}

export interface Notification {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  type: "task" | "payment" | "wallet" | "system";
  isRead: boolean;
}

export interface SettingsItem {
  label: string;
  value: string;
  description?: string;
}

export interface SettingsSectionData {
  title: string;
  description?: string;
  items: SettingsItem[];
}
