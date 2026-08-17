"use client";

import type { ReactNode } from "react";
import { useWallet } from "@/hooks/useWallet";
import { truncateAddress } from "@/lib/utils/address";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export function WalletInfo() {
  const { address, isConnected, chainName, connectorName } = useWallet();

  const rows: { label: string; value: ReactNode }[] = [
    {
      label: "Wallet Address",
      value: address ? truncateAddress(address) : "Not connected",
    },
    {
      label: "Connection Status",
      value: (
        <Badge tone={isConnected ? "success" : "neutral"}>
          {isConnected ? "Connected" : "Not connected"}
        </Badge>
      ),
    },
    {
      label: "Network",
      value: isConnected ? (chainName ?? "Unrecognized network") : "—",
    },
    {
      label: "Connector",
      value: connectorName ?? "—",
    },
  ];

  return (
    <Card className="p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">Wallet</h2>
      <dl className="mt-4 flex flex-col gap-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <dt className="text-sm text-zinc-600 dark:text-zinc-400">
              {row.label}
            </dt>
            <dd className="truncate text-sm font-medium text-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
