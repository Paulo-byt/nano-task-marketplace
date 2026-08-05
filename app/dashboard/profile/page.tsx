import { getProfileStats } from "@/services/dashboard/mockProfileService";
import { ProfileCard } from "@/components/dashboard/ProfileCard";
import { WalletInfo } from "@/components/dashboard/WalletInfo";
import { ProfileStats } from "@/components/dashboard/ProfileStats";

// Profile itself is still mock-driven (see mockProfileService.ts) and out of
// scope for the earnings migration, so this stays a fixed placeholder rather
// than following earnings into a wallet-scoped, client-fetched shape here.
const MOCK_TOTAL_EARNINGS_USDC = 18.95;

export default function ProfilePage() {
  const profileStats = getProfileStats();
  const totalEarningsUsdc = MOCK_TOTAL_EARNINGS_USDC;

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
      <ProfileStats stats={profileStats} totalEarningsUsdc={totalEarningsUsdc} />
    </div>
  );
}
