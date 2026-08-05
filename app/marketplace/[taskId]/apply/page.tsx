import { notFound } from "next/navigation";
import { getTaskById } from "@/services/marketplace/mockTasks";
import { ApplyConfirmation } from "@/components/marketplace/ApplyConfirmation";

export default async function ApplyPage({
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
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <ApplyConfirmation task={task} />
    </div>
  );
}
