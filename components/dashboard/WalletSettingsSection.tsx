"use client";

import { useWallet } from "@/hooks/useWallet";
import { truncateAddress } from "@/lib/utils/address";
import { SettingsSection } from "@/components/dashboard/SettingsSection";
import { SettingsRow } from "@/components/dashboard/SettingsRow";
import { Badge } from "@/components/ui/Badge";

export function WalletSettingsSection() {
  const { address, isConnected, chainName } = useWallet();

  return (
    <SettingsSection
      title="Wallet"
      description="Your connected wallet and network details."
    >
      <SettingsRow
        label="Connection Status"
        value={
          <Badge tone={isConnected ? "success" : "neutral"}>
            {isConnected ? "Connected" : "Not connected"}
          </Badge>
        }
      />
      <SettingsRow
        label="Wallet Address"
        value={address ? truncateAddress(address) : "Not connected"}
      />
      <SettingsRow
        label="Network"
        value={isConnected ? (chainName ?? "Unrecognized network") : "—"}
      />
    </SettingsSection>
  );
}
