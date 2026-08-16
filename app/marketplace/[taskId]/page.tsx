import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getTaskById } from "@/services/marketplace/mockTasks";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getMyApplicationForTask } from "@/services/applications/applicationsService";
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

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/marketplace"
        className="mb-6 inline-block text-sm font-medium text-zinc-600 transition-colors hover:text-foreground dark:text-zinc-400"
      >
        ← Back to Marketplace
      </Link>

      <TaskDetails task={task} myApplication={myApplication} />
    </div>
  );
}
