"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import { NotificationList } from "@/components/dashboard/NotificationList";
import type { Notification } from "@/types/dashboard";

async function fetchNotifications(): Promise<Notification[]> {
  const response = await fetch("/api/notifications");

  if (!response.ok) {
    throw new Error("Failed to load notifications.");
  }

  const data = await response.json();
  return data.notifications as Notification[];
}

function StateCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10">
      <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
        <h2 className="text-sm font-semibold text-foreground">
          Notifications
        </h2>
      </div>
      <p className="px-5 py-8 text-center text-sm text-zinc-500">
        {message}
      </p>
    </div>
  );
}

export function NotificationsContainer() {
  const { address, isConnected, isAuthenticated } = useWallet();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["notifications", address],
    queryFn: fetchNotifications,
    enabled: isAuthenticated,
  });

  if (!isConnected) {
    return (
      <StateCard message="Connect your wallet to see your notifications." />
    );
  }

  if (!isAuthenticated) {
    return <StateCard message="Sign in to see your notifications." />;
  }

  if (isLoading) {
    return <StateCard message="Loading your notifications…" />;
  }

  if (isError) {
    return (
      <StateCard message="Couldn't load your notifications. Try refreshing the page." />
    );
  }

  return <NotificationList notifications={data ?? []} />;
}
