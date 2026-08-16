"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

function isUnderPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

interface NavLink {
  label: string;
  href: string;
  isActive: (pathname: string) => boolean;
}

// Profile and Notifications (C5) are reachable only from the Settings page
// now, so they're conceptually part of the Settings subtree even though
// their routes don't nest under /dashboard/settings.
function isSettingsRoute(pathname: string): boolean {
  return (
    isUnderPath(pathname, "/dashboard/settings") ||
    isUnderPath(pathname, "/dashboard/profile") ||
    isUnderPath(pathname, "/dashboard/notifications")
  );
}

// Dashboard also covers the Marketplace workspace and every /dashboard/*
// descendant except the Settings subtree, which is its own top-level
// destination and must win over Dashboard's own broader match.
const NAV_LINKS: NavLink[] = [
  {
    label: "Home",
    href: "/",
    isActive: (pathname) => pathname === "/",
  },
  {
    label: "Dashboard",
    href: "/dashboard",
    isActive: (pathname) =>
      (isUnderPath(pathname, "/dashboard") && !isSettingsRoute(pathname)) ||
      isUnderPath(pathname, "/marketplace"),
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    isActive: (pathname) => isSettingsRoute(pathname),
  },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="order-3 flex items-center gap-1 text-sm font-medium md:order-2"
    >
      {NAV_LINKS.map((link) => {
        const isActive = link.isActive(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 transition-colors",
              isActive
                ? "bg-primary/10 text-primary visited:text-primary"
                : "text-zinc-600 visited:text-zinc-600 hover:bg-surface-muted hover:text-foreground dark:text-zinc-400 dark:visited:text-zinc-400"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
