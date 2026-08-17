"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import type { SettingsSectionData } from "@/types/dashboard";
import { SettingsSection } from "@/components/dashboard/SettingsSection";
import { SettingsRow } from "@/components/dashboard/SettingsRow";
import { WalletSettingsSection } from "@/components/dashboard/WalletSettingsSection";
import { StateCard } from "@/components/ui/StateCard";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

async function fetchSettings(): Promise<SettingsSectionData[]> {
  const response = await fetch("/api/settings");

  if (!response.ok) {
    throw new Error("Failed to load settings.");
  }

  const data = await response.json();
  return data.sections as SettingsSectionData[];
}

// Display-only rename: the settings data source (services/dashboard/
// mockSettingsService.ts) still calls this section "Notifications" --
// unchanged, since it's just a static label with no functional meaning.
// Renamed here at render time to avoid confusion with the real
// notification feed at /dashboard/notifications, now that both are
// reachable from the same Settings page.
function renderSection(section: SettingsSectionData) {
  const title =
    section.title === "Notifications" ? "Notification Preferences" : section.title;

  return (
    <SettingsSection key={section.title} title={title} description={section.description}>
      {section.items.map((item) => renderItem(section.title, item))}
    </SettingsSection>
  );
}

// Same display-only substitution as the title rename above, one level
// down: mockSettingsService.ts's static "Theme: System default" item is
// swapped for the real, working ThemeToggle at render time. The
// underlying static data is untouched -- this is presentation only,
// exactly like the section-title rename immediately above it.
function renderItem(
  sectionTitle: string,
  item: SettingsSectionData["items"][number]
) {
  if (sectionTitle === "Appearance" && item.label === "Theme") {
    return (
      <SettingsRow
        key={item.label}
        label="Theme"
        description="Choose how Nano looks on this device."
        value={<ThemeToggle />}
      />
    );
  }

  return <SettingsRow key={item.label} {...item} />;
}

// Mirrors SettingsSection's own Card-with-title, divided-row shape.
function SettingsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading settings"
      className="rounded-xl border border-border bg-surface p-5"
    >
      <span className="sr-only">Loading your settings…</span>
      <div aria-hidden="true" className="divide-y divide-border">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-4 py-3">
            <div className="h-3.5 w-28 animate-pulse rounded bg-surface-muted" />
            <div className="h-3.5 w-16 animate-pulse rounded bg-surface-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsContainer() {
  const { address, isConnected, isAuthenticated } = useWallet();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["settings", address],
    queryFn: fetchSettings,
    enabled: isAuthenticated,
  });

  let topContent: ReactNode;
  let bottomContent: ReactNode = null;

  if (!isConnected) {
    topContent = (
      <StateCard message="Connect your wallet to see your settings." className="shadow-sm" />
    );
  } else if (!isAuthenticated) {
    topContent = (
      <StateCard message="Sign in to see your settings." className="shadow-sm" />
    );
  } else if (isLoading) {
    topContent = <SettingsSkeleton />;
  } else if (isError || !data) {
    topContent = (
      <StateCard message="We couldn't load your settings." className="shadow-sm">
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </StateCard>
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
