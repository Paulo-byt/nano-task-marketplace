import type { ActivityItem } from "@/types/dashboard";
import { Card } from "@/components/ui/Card";

// Three distinct hues from the real token/brand palette (not raw colors):
// info for "you took an action," success for a positive milestone, and
// primary (brand) specifically for money arriving -- since payment and
// completed are otherwise both "positive" events, collapsing them onto
// the same tone would lose the at-a-glance scannability this dot list is
// for. Distinguishable by more than color alone regardless, since each
// row's own description text always states what happened.
const ACTIVITY_DOT_STYLES: Record<ActivityItem["type"], string> = {
  applied: "bg-info",
  completed: "bg-success",
  payment: "bg-primary",
};

export function RecentActivity({ activity }: { activity: ActivityItem[] }) {
  return (
    <Card className="p-5">
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
        <p className="mt-4 text-sm text-zinc-500">
          No recent activity yet. Activity from applications, submissions,
          and payouts will show up here.
        </p>
      )}
    </Card>
  );
}
