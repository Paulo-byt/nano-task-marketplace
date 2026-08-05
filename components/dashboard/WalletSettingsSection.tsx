"use client";

import { useWallet } from "@/hooks/useWallet";
import { truncateAddress } from "@/lib/utils/address";
import { SettingsSection } from "@/components/dashboard/SettingsSection";
import { SettingsRow } from "@/components/dashboard/SettingsRow";

export function WalletSettingsSection() {
  const { address, isConnected, chainName } = useWallet();

  return (
    <SettingsSection
      title="Wallet"
      description="Your connected wallet and network details."
    >
      <SettingsRow
        label="Connection Status"
        value={isConnected ? "Connected" : "Not connected"}
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
