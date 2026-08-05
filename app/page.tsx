import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";

const stats = [
  { label: "Task range", value: "$0.01 – $5.00" },
  { label: "Settlement", value: "Instant on Arc" },
  { label: "Requirements", value: "Just a wallet" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-24 text-foreground">
      <div className="flex w-full max-w-2xl flex-col items-center text-center">
        <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium tracking-wide text-zinc-600 dark:border-white/15 dark:text-zinc-400">
          Built on Arc · Testnet
        </span>

        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
          Nano Task Marketplace
        </h1>

        <p className="mt-4 max-w-md text-base text-zinc-600 dark:text-zinc-400 sm:text-lg">
          Post micro-tasks with USDC rewards, or complete tasks and get paid
          instantly. No bank account required — just a wallet.
        </p>

        <div className="mt-8">
          <ConnectWalletButton />
        </div>

        <dl className="mt-16 grid w-full grid-cols-1 gap-6 border-t border-black/10 pt-8 dark:border-white/10 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center gap-1 text-center"
            >
              <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                {stat.label}
              </dt>
              <dd className="text-sm font-medium text-foreground">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
