"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SIDEBAR_LINKS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "My Tasks", href: "/dashboard/my-tasks" },
  { label: "Earnings", href: "/dashboard/earnings" },
  { label: "Profile", href: "/dashboard/profile" },
  { label: "Notifications", href: "/dashboard/notifications" },
  { label: "Settings", href: "/dashboard/settings" },
];

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

  return (
    <>
      <div className="border-b border-black/10 p-4 dark:border-white/10 md:hidden">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-controls="dashboard-sidebar"
          className="inline-flex items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          <MenuIcon />
          Menu
        </button>
      </div>

      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
        />
      )}

      <aside
        id="dashboard-sidebar"
        className={`fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto border-r border-black/10 bg-background px-4 py-6 transition-transform duration-200 ease-in-out dark:border-white/10 md:static md:z-auto md:w-56 md:translate-x-0 md:transition-none ${
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
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-black/5 text-foreground visited:text-foreground dark:bg-white/5"
                    : "text-zinc-600 visited:text-zinc-600 hover:bg-black/5 hover:text-foreground dark:text-zinc-400 dark:visited:text-zinc-400 dark:hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
