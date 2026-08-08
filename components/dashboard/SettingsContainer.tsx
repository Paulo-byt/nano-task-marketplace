"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import type { SettingsSectionData } from "@/types/dashboard";
import { SettingsSection } from "@/components/dashboard/SettingsSection";
import { SettingsRow } from "@/components/dashboard/SettingsRow";
import { WalletSettingsSection } from "@/components/dashboard/WalletSettingsSection";

async function fetchSettings(): Promise<SettingsSectionData[]> {
  const response = await fetch("/api/settings");

  if (!response.ok) {
    throw new Error("Failed to load settings.");
  }

  const data = await response.json();
  return data.sections as SettingsSectionData[];
}

function renderSection(section: SettingsSectionData) {
  return (
    <SettingsSection
      key={section.title}
      title={section.title}
      description={section.description}
    >
      {section.items.map((item) => (
        <SettingsRow key={item.label} {...item} />
      ))}
    </SettingsSection>
  );
}

function StateCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-black/10 p-5 text-center text-sm text-zinc-500 dark:border-white/10">
      {message}
    </div>
  );
}

export function SettingsContainer() {
  const { address, isConnected, isAuthenticated } = useWallet();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["settings", address],
    queryFn: fetchSettings,
    enabled: isAuthenticated,
  });

  let topContent: ReactNode;
  let bottomContent: ReactNode = null;

  if (!isConnected) {
    topContent = (
      <StateCard message="Connect your wallet to see your settings." />
    );
  } else if (!isAuthenticated) {
    topContent = <StateCard message="Sign in to see your settings." />;
  } else if (isLoading) {
    topContent = <StateCard message="Loading your settings…" />;
  } else if (isError || !data) {
    topContent = (
      <StateCard message="Couldn't load settings. Try refreshing the page." />
    );
  } else {
    const [appearance, ...rest] = data;
    topContent = appearance ? renderSection(appearance) : null;
    bottomContent = rest.map(renderSection);
  }

  return (
    <>
      {topContent}
      <WalletSettingsSection />
      {bottomContent}
    </>
  );
}
