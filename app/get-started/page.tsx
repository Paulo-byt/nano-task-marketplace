import type { Metadata } from "next";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { GettingStartedExperience } from "@/components/onboarding/GettingStartedExperience";

export const metadata: Metadata = {
  title: "Get Started — Nano Task Marketplace",
  description: "Learn how Nano Task Marketplace works for taskers and creators.",
};

export default function GetStartedPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12 sm:py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Small tasks. Real rewards.
        </h1>
        <p className="max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
          Nano is a marketplace for small tasks. Complete simple jobs and get
          paid in USDC, or post a task and get help fast — no bank account
          needed, just a wallet.
        </p>
      </div>

      <GettingStartedExperience />

      <div className="flex flex-col items-start gap-4 rounded-xl border border-border bg-surface-muted p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Connect your wallet to use Nano.
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Nano runs on Arc Testnet, and every task pays in USDC — no bank
            account needed.
          </p>
        </div>
        <ConnectWalletButton compact />
      </div>
    </div>
  );
}
