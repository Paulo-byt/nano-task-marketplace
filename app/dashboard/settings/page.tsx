import { getSettingsSections } from "@/services/dashboard/mockSettingsService";
import type { SettingsSectionData } from "@/types/dashboard";
import { SettingsSection } from "@/components/dashboard/SettingsSection";
import { SettingsRow } from "@/components/dashboard/SettingsRow";
import { WalletSettingsSection } from "@/components/dashboard/WalletSettingsSection";

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

export default function SettingsPage() {
  const [appearance, ...rest] = getSettingsSections();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Settings
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Preferences and account details. Nothing here is editable yet.
        </p>
      </div>

      {renderSection(appearance)}
      <WalletSettingsSection />
      {rest.map(renderSection)}
    </div>
  );
}
