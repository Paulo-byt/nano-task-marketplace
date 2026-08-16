import { Button } from "@/components/ui/Button";

export default function TaskNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold text-foreground">
        Task not found
      </h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This task may have been completed, removed, or the link is incorrect.
      </p>
      <Button href="/marketplace" variant="brand" className="mt-2">
        Back to Marketplace
      </Button>
    </div>
  );
}
