"use client";

import { useWallet } from "@/hooks/useWallet";
import { truncateAddress } from "@/lib/utils/address";
import { Card } from "@/components/ui/Card";

export function ProfileCard() {
  const { address, isConnected } = useWallet();

  return (
    <Card className="flex items-center gap-4 p-6 shadow-sm">
      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
        {isConnected && address ? address.slice(2, 4).toUpperCase() : "?"}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xl font-semibold text-foreground">
          {isConnected && address
            ? truncateAddress(address)
            : "Wallet not connected"}
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Task marketplace contributor
        </p>
      </div>
    </Card>
  );
}
