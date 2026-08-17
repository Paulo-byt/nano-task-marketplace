import Link from "next/link";
import type { Notification } from "@/types/dashboard";
import { Badge } from "@/components/ui/Badge";

const TYPE_TONES: Record<Notification["type"], "info" | "success" | "neutral"> = {
  task: "info",
  payment: "success",
  wallet: "neutral",
  system: "neutral",
};

// 11H: label only -- "payment" stays the underlying type/db value (see
// db/schema.ts's notificationTypeEnum), matched everywhere else in this
// file and in mockNotificationService.ts. Only the displayed text changes,
// to match the "Payout" language already used by Payout History, Release/
// Retry Payout, and the Earnings page.
const TYPE_LABELS: Record<Notification["type"], string> = {
  task: "Task",
  payment: "Payout",
  wallet: "Wallet",
  system: "System",
};

// No notification row stores a destination -- the schema has no taskId or
// link column (see the 11E audit). Every title below is one this codebase
// itself generates (services/dashboard/mockNotificationService.ts), so
// matching on the exact, fully-controlled title text is safe here in a way
// pattern-matching arbitrary user content would not be. An unmapped title
// (a future notification type this map hasn't been taught yet) simply
// renders with no destination, never a broken or guessed link.
const NOTIFICATION_DESTINATIONS: Record<string, string> = {
  "Application Submitted": "/dashboard/my-tasks",
  "Application Approved": "/dashboard/my-tasks",
  "Application Not Approved": "/dashboard/my-tasks",
  "Work Submitted": "/dashboard/my-tasks",
  "Submission Accepted": "/dashboard/my-tasks",
  "Submission Rejected": "/dashboard/my-tasks",
  "Submission Under Review": "/dashboard/my-tasks",
  "Payout Complete": "/dashboard/earnings",
  "New Application": "/dashboard/posted-tasks",
  "Submission Ready for Review": "/dashboard/posted-tasks",
  "Task Completed": "/dashboard/posted-tasks",
};

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
}) {
  const { id, title, description, timestamp, type, isRead } = notification;
  const href = NOTIFICATION_DESTINATIONS[title];

  const content = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={isRead ? "text-sm font-medium text-foreground" : "text-sm font-semibold text-foreground"}>
          {title}
        </p>
        <Badge tone={TYPE_TONES[type]}>{TYPE_LABELS[type]}</Badge>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      <p className="mt-1 text-xs text-zinc-500">
        <time>{timestamp}</time>
      </p>
    </>
  );

  return (
    <li
      className={`relative flex items-start gap-3 px-5 py-4 transition-colors ${
        isRead ? "" : "bg-primary/5"
      }`}
    >
      <span
        className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
          isRead ? "bg-transparent" : "bg-primary"
        }`}
        aria-hidden="true"
      />

      {href ? (
        <Link
          href={href}
          onClick={() => {
            if (!isRead) onMarkRead(id);
          }}
          className="min-w-0 flex-1 rounded-md transition-opacity hover:opacity-80"
        >
          {content}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{content}</div>
      )}

      {!isRead && (
        <button
          type="button"
          onClick={() => onMarkRead(id)}
          aria-label={`Mark "${title}" as read`}
          className="flex-shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          <CheckIcon />
        </button>
      )}
    </li>
  );
}
