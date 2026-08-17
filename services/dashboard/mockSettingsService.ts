import type { SettingsSectionData } from "@/types/dashboard";

// None of these sections have per-wallet backing data in the schema -- there
// is no preference-storage table, and this migration explicitly excludes
// adding new tables or editable settings. The content is the same for every
// wallet; getSettingsSections() is only called once the API route has
// resolved (and, per the no-auto-create rule, not created) the wallet's
// user row, matching the shape every other dashboard service follows.
const SETTINGS_SECTIONS: SettingsSectionData[] = [
  {
    title: "Appearance",
    description: "Display preferences for the marketplace interface.",
    items: [
      // Display-only placeholder: SettingsContainer.tsx swaps this exact
      // item for the real ThemeToggle at render time, so this static
      // value is never actually shown -- kept here only so the item
      // still exists for that render-time substitution to match against.
      { label: "Theme", value: "System default" },
      {
        label: "Compact Mode",
        value: "Not available",
        description: "Coming in a future update.",
      },
    ],
  },
  {
    title: "Notifications",
    description: "How you're notified about marketplace activity.",
    items: [
      { label: "In-App Notifications", value: "Enabled" },
      {
        label: "Email Notifications",
        value: "Not available",
        description: "Coming in a future update.",
      },
      {
        label: "Push Notifications",
        value: "Not available",
        description: "Coming in a future update.",
      },
    ],
  },
  {
    title: "Security",
    description: "Account protection settings.",
    items: [
      {
        label: "Two-Factor Authentication",
        value: "Not available",
        description: "Coming in a future update.",
      },
      // 11H: corrected to match lib/auth/session.ts's real SESSION_TTL_MS
      // (7 days) -- the previous "30 minutes" was simply wrong, not a
      // "coming soon" case. Not user-configurable, so no toggle-like
      // framing either.
      { label: "Session Length", value: "7 days" },
    ],
  },
  {
    title: "About",
    description: "Application information.",
    items: [
      { label: "App Version", value: "0.1.0" },
      { label: "Network Environment", value: "Arc Testnet" },
    ],
  },
];

export function getSettingsSections(): SettingsSectionData[] {
  return SETTINGS_SECTIONS;
}
