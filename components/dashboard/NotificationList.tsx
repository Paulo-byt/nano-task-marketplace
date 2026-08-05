import type { Notification } from "@/types/dashboard";
import { NotificationItem } from "@/components/dashboard/NotificationItem";

export function NotificationList({
  notifications,
}: {
  notifications: Notification[];
}) {
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10">
      <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
        <h2 className="text-sm font-semibold text-foreground">
          Notifications
        </h2>
        <span className="text-xs text-zinc-500">{unreadCount} unread</span>
      </div>

      {notifications.length > 0 ? (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
            />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-zinc-500">
          No notifications yet.
        </p>
      )}
    </div>
  );
}
