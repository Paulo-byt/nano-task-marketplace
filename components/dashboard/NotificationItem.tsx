import type { Notification } from "@/types/dashboard";

const TYPE_STYLES: Record<Notification["type"], string> = {
  task: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  payment: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  wallet: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  system: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

const TYPE_LABELS: Record<Notification["type"], string> = {
  task: "Task",
  payment: "Payment",
  wallet: "Wallet",
  system: "System",
};

export function NotificationItem({
  notification,
}: {
  notification: Notification;
}) {
  const { title, description, timestamp, type, isRead } = notification;

  return (
    <li
      className={`flex items-start gap-3 px-5 py-4 ${
        isRead ? "" : "bg-black/[0.02] dark:bg-white/[0.03]"
      }`}
    >
      <span
        className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
          isRead ? "bg-transparent" : "bg-foreground"
        }`}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <div className="flex flex-shrink-0 items-center gap-2">
            {!isRead && (
              <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">
                Unread
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[type]}`}
            >
              {TYPE_LABELS[type]}
            </span>
          </div>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
        <p className="mt-1 text-xs text-zinc-500">{timestamp}</p>
      </div>
    </li>
  );
}
