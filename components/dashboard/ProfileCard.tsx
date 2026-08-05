"use client";

import { useWallet } from "@/hooks/useWallet";
import { truncateAddress } from "@/lib/utils/address";

export function ProfileCard() {
  const { address, isConnected } = useWallet();

  return (
    <div className="flex items-center gap-4 rounded-xl border border-black/10 p-6 dark:border-white/10">
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-black/5 text-lg font-semibold text-foreground dark:bg-white/10">
        {isConnected && address ? address.slice(2, 4).toUpperCase() : "?"}
      </div>
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold text-foreground">
          {isConnected && address
            ? truncateAddress(address)
            : "Wallet not connected"}
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Task marketplace contributor
        </p>
      </div>
    </div>
  );
}
