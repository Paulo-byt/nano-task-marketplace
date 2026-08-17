"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

function isUnderPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

interface SidebarLink {
  label: string;
  href: string;
  isActive: (pathname: string) => boolean;
}

// Marketplace covers the whole browse/detail/apply workspace but
// deliberately excludes /marketplace/new -- that's Create Task's own
// destination below, not a Marketplace browsing state.
const SIDEBAR_LINKS: SidebarLink[] = [
  {
    label: "Marketplace",
    href: "/marketplace",
    isActive: (pathname) =>
      isUnderPath(pathname, "/marketplace") &&
      !isUnderPath(pathname, "/marketplace/new"),
  },
  {
    label: "My Tasks",
    href: "/dashboard/my-tasks",
    isActive: (pathname) => isUnderPath(pathname, "/dashboard/my-tasks"),
  },
  {
    label: "Earnings",
    href: "/dashboard/earnings",
    isActive: (pathname) => isUnderPath(pathname, "/dashboard/earnings"),
  },
];

const CREATE_TASK_HREF = "/marketplace/new";

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const isCreateTaskActive = pathname === CREATE_TASK_HREF;

  return (
    <>
      <div className="border-b border-border p-4 md:hidden">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-controls="dashboard-sidebar"
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
        >
          <MenuIcon />
          Menu
        </button>
      </div>

      {isOpen && (
        // Deliberately a raw, theme-invariant black (not a token): a scrim
        // dims whatever's behind it regardless of light/dark mode, unlike
        // every other color in this file. --foreground itself flips
        // between the two (see Button.tsx's own "primary" variant), so
        // bg-foreground/30 here would render as a translucent WHITE
        // overlay in dark mode -- visibly wrong, not a token upgrade.
        <div
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
        />
      )}

      <aside
        id="dashboard-sidebar"
        className={`fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto border-r border-border bg-background px-4 py-6 transition-transform duration-200 ease-in-out md:static md:z-auto md:w-56 md:translate-x-0 md:transition-none ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between md:hidden">
          <span className="text-sm font-semibold text-foreground">Menu</span>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
            className="rounded-md p-1 text-zinc-500 transition-colors hover:text-foreground"
          >
            <CloseIcon />
          </button>
        </div>

        <nav aria-label="Dashboard navigation" className="flex flex-col gap-1">
          {SIDEBAR_LINKS.map((link) => {
            const isActive = link.isActive(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "rounded-md border-l-2 px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-primary visited:text-primary"
                    : "border-transparent text-zinc-600 visited:text-zinc-600 hover:bg-surface-muted hover:text-foreground dark:text-zinc-400 dark:visited:text-zinc-400"
                )}
              >
                {link.label}
              </Link>
            );
          })}

          <div className="my-3 border-t border-border" aria-hidden="true" />

          {/* Prominent action, not an ordinary destination -- deliberately
              not the Button primitive: Button's href/Link mode only
              forwards href/target/rel, so it can't carry the onClick this
              drawer needs for close-on-navigate, or aria-current for the
              active route. Styled to match Button's brand/lg look exactly
              (see components/ui/Button.tsx's own "brand" variant), without
              modifying that primitive. */}
          <Link
            href={CREATE_TASK_HREF}
            onClick={() => setIsOpen(false)}
            aria-current={isCreateTaskActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground visited:text-primary-foreground transition-colors hover:opacity-90",
              isCreateTaskActive &&
                "ring-2 ring-primary ring-offset-2 ring-offset-background"
            )}
          >
            + Create Task
          </Link>
        </nav>
      </aside>
    </>
  );
}
