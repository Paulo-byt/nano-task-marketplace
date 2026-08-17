import type { ReactNode } from "react";

interface SettingsRowProps {
  label: string;
  // ReactNode (not just string) so a caller can pass a Badge for a
  // status-like value (WalletSettingsSection's "Connected"/"Not
  // connected") instead of always rendering flat text -- every existing
  // plain-string caller (the API-driven settings sections) keeps working
  // unchanged, since a string is a valid ReactNode.
  value: ReactNode;
  description?: string;
}

export function SettingsRow({ label, value, description }: SettingsRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
        )}
      </div>
      <span className="flex-shrink-0 text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}
