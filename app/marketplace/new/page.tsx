import { CreateTaskForm } from "@/components/marketplace/CreateTaskForm";

export default function NewTaskPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Post a Task
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Describe the task and set a reward between $0.01 and $5.00 USDC.
          Funding happens separately, after the task is created.
        </p>
      </div>

      <CreateTaskForm />
    </div>
  );
}
