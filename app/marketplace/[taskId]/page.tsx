import Link from "next/link";
import { notFound } from "next/navigation";
import { getTaskById } from "@/services/marketplace/mockTasks";
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

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/marketplace"
        className="mb-6 inline-block text-sm font-medium text-zinc-600 transition-colors hover:text-foreground dark:text-zinc-400"
      >
        ← Back to Marketplace
      </Link>

      <TaskDetails task={task} />
    </div>
  );
}
