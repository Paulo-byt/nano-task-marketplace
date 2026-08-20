import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getTaskById } from "@/services/marketplace/mockTasks";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getMyApplicationForTask } from "@/services/applications/applicationsService";
import { getTaskTemplateId } from "@/services/marketplace/taskTemplatesService";
import { isActiveTierTemplate } from "@/lib/evaluation/platformGroundTruth";
import { TaskDetails } from "@/components/marketplace/TaskDetails";

export default async function TaskDetailsPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const task = await getTaskById(taskId);

  if (!task) {
    notFound();
  }

  // M4 (active-task workspace): resolved server-side, the same
  // cookies() -> getSessionUser() pattern every protected route already
  // uses -- an unauthenticated or not-yet-applied visitor gets undefined
  // here, and TaskDetails renders exactly as it always has.
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = sessionId ? await getSessionUser(sessionId) : undefined;
  const myApplication = sessionUser
    ? await getMyApplicationForTask(taskId, sessionUser.id)
    : undefined;

  // Tester catalog visibility: a creator-owned task (templateId null) is
  // always applyable, unaffected. A platform task is only applyable while
  // its own template is active-tier -- direct navigation to an old, still-
  // open instance of a now-paused template must not offer a NEW
  // application, even though the marketplace listing already excludes it.
  // Deliberately does NOT affect an existing applicant (myApplication is
  // checked, not overridden, inside TaskDetails itself) -- someone who
  // already applied before their template was paused keeps working
  // exactly as before.
  const applyTemplateId = await getTaskTemplateId(taskId);
  const isApplyable = !applyTemplateId || (await isActiveTierTemplate(applyTemplateId));

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      {/* Compact secondary nav: this page lives outside the /dashboard route
          group, so it never gets the Sidebar (Marketplace/My Tasks/Earnings)
          that every /dashboard/* page renders -- the only path back to the
          rest of the app was previously this single "Back to Marketplace"
          link. flex-wrap keeps it on one line on desktop and lets it drop
          to a second line on narrow screens instead of squeezing. */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
        <Link
          href="/marketplace"
          className="transition-colors hover:text-foreground"
        >
          ← Back to Marketplace
        </Link>
        <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
          |
        </span>
        <Link href="/dashboard" className="transition-colors hover:text-foreground">
          Dashboard
        </Link>
        <Link href="/dashboard/my-tasks" className="transition-colors hover:text-foreground">
          My Tasks
        </Link>
        <Link href="/dashboard/earnings" className="transition-colors hover:text-foreground">
          Earnings
        </Link>
      </div>

      <TaskDetails task={task} myApplication={myApplication} isApplyable={isApplyable} />
    </div>
  );
}
