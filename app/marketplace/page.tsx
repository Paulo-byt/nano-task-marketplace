import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getTasks, MARKETPLACE_PAGE_SIZE } from "@/services/marketplace/mockTasks";
import { MarketplaceBrowser } from "@/components/marketplace/MarketplaceBrowser";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  // Optional: an anonymous browser gets the same page with no applicant
  // exclusion, exactly like GET /api/tasks handles a missing/invalid
  // session -- never a redirect or a 401 for simply viewing the marketplace.
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = sessionId ? await getSessionUser(sessionId) : undefined;

  const initialPage = await getTasks({
    viewerId: sessionUser?.id,
    pageSize: MARKETPLACE_PAGE_SIZE,
  });

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

      <MarketplaceBrowser
        initialTasks={initialPage.tasks}
        initialNextCursor={initialPage.nextCursor}
      />
    </div>
  );
}
