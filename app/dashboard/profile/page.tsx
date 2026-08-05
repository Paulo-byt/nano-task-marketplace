import { ProfileCard } from "@/components/dashboard/ProfileCard";
import { WalletInfo } from "@/components/dashboard/WalletInfo";
import { ProfileStatsContainer } from "@/components/dashboard/ProfileStatsContainer";

export default function ProfilePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Profile
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Your wallet connection and marketplace activity.
        </p>
      </div>

      <ProfileCard />
      <WalletInfo />
      <ProfileStatsContainer />
    </div>
  );
}
