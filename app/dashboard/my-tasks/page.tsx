import { MyTasksContainer } from "@/components/dashboard/MyTasksContainer";

export default function MyTasksPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          My Tasks
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Tasks you&apos;ve applied for.
        </p>
      </div>

      <MyTasksContainer />
    </div>
  );
}
