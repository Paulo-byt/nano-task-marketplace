import Link from "next/link";
import { SettingsContainer } from "@/components/dashboard/SettingsContainer";

const SETTINGS_NAV = [
  {
    label: "Profile",
    description: "Your wallet identity and account information",
    href: "/dashboard/profile",
  },
  {
    label: "Notifications",
    description: "View and manage your notifications",
    href: "/dashboard/notifications",
  },
];

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

      {/* Card (components/ui/Card.tsx) always renders a <div>, with no way
          to render as a real link -- these rows need to be one real,
          keyboard-focusable <a> each, not a Link nested inside a
          non-interactive wrapper, so they're styled to match Card's visual
          language directly instead of modifying the primitive. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SETTINGS_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">
                {item.label}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{item.description}</p>
            </div>
            <span
              className="text-zinc-400 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            >
              →
            </span>
          </Link>
        ))}
      </div>

      <SettingsContainer />
    </div>
  );
}
