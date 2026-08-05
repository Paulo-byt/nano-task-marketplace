"use client";

import { useWallet } from "@/hooks/useWallet";
import { truncateAddress } from "@/lib/utils/address";

export function WalletInfo() {
  const { address, isConnected, chainName, connectorName } = useWallet();

  const rows = [
    {
      label: "Wallet Address",
      value: address ? truncateAddress(address) : "Not connected",
    },
    {
      label: "Connection Status",
      value: isConnected ? "Connected" : "Not connected",
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
    <div className="rounded-xl border border-black/10 p-5 dark:border-white/10">
      <h2 className="text-sm font-semibold text-foreground">Wallet</h2>
      <dl className="mt-4 flex flex-col gap-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4"
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
    </div>
  );
}
