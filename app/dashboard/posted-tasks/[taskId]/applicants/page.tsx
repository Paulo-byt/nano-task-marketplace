import { notFound } from "next/navigation";
import { getTaskById } from "@/services/marketplace/mockTasks";
import { ApplicantsContainer } from "@/components/dashboard/ApplicantsContainer";

export default async function TaskApplicantsPage({
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Applicants
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Everyone who has applied for &quot;{task.title}&quot;.
        </p>
      </div>

      <ApplicantsContainer taskId={taskId} />
    </div>
  );
}
