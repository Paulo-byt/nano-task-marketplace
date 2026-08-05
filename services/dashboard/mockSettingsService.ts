import type { SettingsSectionData } from "@/types/dashboard";

const MOCK_SETTINGS_SECTIONS: SettingsSectionData[] = [
  {
    title: "Appearance",
    description: "Display preferences for the marketplace interface.",
    items: [
      { label: "Theme", value: "System default" },
      { label: "Compact Mode", value: "Disabled" },
    ],
  },
  {
    title: "Notifications",
    description: "How you're notified about marketplace activity.",
    items: [
      { label: "In-App Notifications", value: "Enabled" },
      { label: "Email Notifications", value: "Disabled" },
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
      { label: "Two-Factor Authentication", value: "Not enabled" },
      { label: "Session Timeout", value: "30 minutes" },
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
  return MOCK_SETTINGS_SECTIONS;
}
