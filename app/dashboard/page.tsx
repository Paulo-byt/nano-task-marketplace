import {
  getDashboardSummary,
  getRecentActivity,
} from "@/services/dashboard/mockDashboardService";
import { WelcomeSection } from "@/components/dashboard/WelcomeSection";
import { SummaryCardsGrid } from "@/components/dashboard/SummaryCardsGrid";
import { RecentActivity } from "@/components/dashboard/RecentActivity";

export default function DashboardPage() {
  const summary = getDashboardSummary();
  const activity = getRecentActivity();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <WelcomeSection />
      <SummaryCardsGrid summary={summary} />
      <RecentActivity activity={activity} />
    </div>
  );
}
