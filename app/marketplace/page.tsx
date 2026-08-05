import { getTasks } from "@/services/marketplace/mockTasks";
import { MarketplaceBrowser } from "@/components/marketplace/MarketplaceBrowser";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const tasks = await getTasks();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Marketplace
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Browse available tasks and start earning USDC.
        </p>
      </div>

      <MarketplaceBrowser tasks={tasks} />
    </div>
  );
}
