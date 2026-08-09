"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "My Tasks", href: "/dashboard/my-tasks" },
  { label: "Posted Tasks", href: "/dashboard/posted-tasks" },
  { label: "Earnings", href: "/dashboard/earnings" },
  { label: "Profile", href: "/dashboard/profile" },
  { label: "Notifications", href: "/dashboard/notifications" },
  { label: "Settings", href: "/dashboard/settings" },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="order-3 flex w-full min-w-0 items-center gap-5 overflow-x-auto text-sm font-medium text-zinc-600 dark:text-zinc-400 md:order-2 md:w-auto"
    >
      {NAV_LINKS.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? "page" : undefined}
            className={`whitespace-nowrap transition-colors ${
              isActive
                ? "text-foreground visited:text-foreground"
                : "text-zinc-600 visited:text-zinc-600 hover:text-foreground dark:text-zinc-400 dark:visited:text-zinc-400"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
