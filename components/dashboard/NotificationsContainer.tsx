"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import { NotificationList } from "@/components/dashboard/NotificationList";
import { StateCard } from "@/components/ui/StateCard";
import { Button } from "@/components/ui/Button";
import type { Notification } from "@/types/dashboard";

async function fetchNotifications(): Promise<Notification[]> {
  const response = await fetch("/api/notifications");

  if (!response.ok) {
    throw new Error("Failed to load notifications.");
  }

  const data = await response.json();
  return data.notifications as Notification[];
}

function NotificationItemSkeleton() {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-surface-muted" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="h-4 w-32 animate-pulse rounded bg-surface-muted" />
          <div className="h-5 w-14 animate-pulse rounded-full bg-surface-muted" />
        </div>
        <div className="h-3.5 w-full animate-pulse rounded bg-surface-muted" />
        <div className="h-3 w-20 animate-pulse rounded bg-surface-muted" />
      </div>
    </div>
  );
}

export function NotificationsContainer() {
  const { address, isConnected, isAuthenticated } = useWallet();
  const queryClient = useQueryClient();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["notifications", address],
    queryFn: fetchNotifications,
    enabled: isAuthenticated,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/notifications/${id}/read`, { method: "POST" }),
    onSuccess: invalidate,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => fetch("/api/notifications/read-all", { method: "POST" }),
    onSuccess: invalidate,
  });

  if (!isConnected) {
    return (
      <StateCard
        title="Notifications"
        message="Connect your wallet to see your notifications."
        className="shadow-sm"
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <StateCard
        title="Notifications"
        message="Sign in to see your notifications."
        className="shadow-sm"
      />
    );
  }

  if (isPending) {
    return (
      <div
        role="status"
        aria-label="Loading notifications"
        className="divide-y divide-border rounded-xl border border-border bg-surface shadow-sm"
      >
        <span className="sr-only">Loading notifications…</span>
        <div aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <NotificationItemSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <StateCard
        title="Notifications"
        message="We couldn't load your notifications."
        className="shadow-sm"
      >
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </StateCard>
    );
  }

  const notifications = data ?? [];

  if (notifications.length === 0) {
    return (
      <StateCard
        title="You're all caught up"
        message="New activity about your tasks, applications, and payouts will show up here."
        className="shadow-sm"
      />
    );
  }

  return (
    <NotificationList
      notifications={notifications}
      onMarkRead={(id) => markReadMutation.mutate(id)}
      onMarkAllRead={() => markAllReadMutation.mutate()}
      isMarkingAllRead={markAllReadMutation.isPending}
    />
  );
}
