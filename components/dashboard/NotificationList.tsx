import type { Notification } from "@/types/dashboard";
import { NotificationItem } from "@/components/dashboard/NotificationItem";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function NotificationList({
  notifications,
  onMarkRead,
  onMarkAllRead,
  isMarkingAllRead,
}: {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  isMarkingAllRead: boolean;
}) {
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <Card className="shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
          {unreadCount > 0 && (
            <span className="text-xs text-zinc-500">
              {unreadCount} unread
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="link"
            size="sm"
            onClick={onMarkAllRead}
            disabled={isMarkingAllRead}
          >
            Mark all as read
          </Button>
        )}
      </div>

      <ul className="divide-y divide-border">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onMarkRead={onMarkRead}
          />
        ))}
      </ul>
    </Card>
  );
}
