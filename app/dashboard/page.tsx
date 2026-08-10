import { WelcomeSection } from "@/components/dashboard/WelcomeSection";
import { DashboardOverviewContainer } from "@/components/dashboard/DashboardOverviewContainer";

export default function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <WelcomeSection />
      <DashboardOverviewContainer />
    </div>
  );
}
