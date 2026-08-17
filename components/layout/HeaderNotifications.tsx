"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import type { Notification } from "@/types/dashboard";

async function fetchNotifications(): Promise<Notification[]> {
  const response = await fetch("/api/notifications");

  if (!response.ok) {
    throw new Error("Failed to load notifications.");
  }

  const data = await response.json();
  return data.notifications as Notification[];
}

function BellIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// Shares the exact ["notifications", address] query key the notifications
// page itself uses (NotificationsContainer.tsx) -- TanStack Query dedupes
// them into one cached fetch, and marking anything read there invalidates
// this badge too, without this component needing to know that happened.
export function HeaderNotifications() {
  const { address, isAuthenticated } = useWallet();

  const { data } = useQuery({
    queryKey: ["notifications", address],
    queryFn: fetchNotifications,
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return null;
  }

  const unreadCount = (data ?? []).filter((notification) => !notification.isRead).length;

  return (
    <Link
      href="/dashboard/notifications"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-surface-muted hover:text-foreground dark:text-zinc-400"
    >
      <BellIcon />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary"
        />
      )}
    </Link>
  );
}
