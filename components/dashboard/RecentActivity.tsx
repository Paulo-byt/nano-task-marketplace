import type { ActivityItem } from "@/types/dashboard";

const ACTIVITY_DOT_STYLES: Record<ActivityItem["type"], string> = {
  applied: "bg-blue-500",
  completed: "bg-emerald-500",
  payment: "bg-violet-500",
};

export function RecentActivity({ activity }: { activity: ActivityItem[] }) {
  return (
    <div className="rounded-xl border border-black/10 p-5 dark:border-white/10">
      <h2 className="text-sm font-semibold text-foreground">
        Recent Activity
      </h2>

      {activity.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-4">
          {activity.map((item) => (
            <li key={item.id} className="flex items-start gap-3">
              <span
                className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${ACTIVITY_DOT_STYLES[item.type]}`}
                aria-hidden="true"
              />
              <div className="flex-1">
                <p className="text-sm text-foreground">{item.description}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {item.timestamp}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">No recent activity yet.</p>
      )}
    </div>
  );
}
