import { SettingsContainer } from "@/components/dashboard/SettingsContainer";

export default function SettingsPage() {
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

      <SettingsContainer />
    </div>
  );
}
