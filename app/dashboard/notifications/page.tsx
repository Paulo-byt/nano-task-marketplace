import { NotificationsContainer } from "@/components/dashboard/NotificationsContainer";

export default function NotificationsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Notifications
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Stay up to date on tasks, payments, and account activity.
        </p>
      </div>

      <NotificationsContainer />
    </div>
  );
}
