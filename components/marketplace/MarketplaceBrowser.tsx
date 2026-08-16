"use client";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Task } from "@/types/task";
import type { TaskCursor } from "@/services/marketplace/mockTasks";
import { SearchBar } from "@/components/marketplace/SearchBar";
import { FilterChips } from "@/components/marketplace/FilterChips";
import { TaskCard } from "@/components/marketplace/TaskCard";
import { StateCard } from "@/components/ui/StateCard";
import { Button } from "@/components/ui/Button";

const RESULTS_GRID_CLASSES = "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3";

const CATEGORIES = ["All", "Writing", "AI", "Research", "Design", "Social"];
const SEARCH_DEBOUNCE_MS = 400;

interface TaskPageResponse {
  tasks: Task[];
  nextCursor: TaskCursor | null;
}

async function fetchTaskPage(
  search: string,
  category: string,
  cursor: TaskCursor | null
): Promise<TaskPageResponse> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category !== "All") params.set("category", category);
  if (cursor) {
    params.set("cursorCreatedAt", cursor.createdAt);
    params.set("cursorId", cursor.id);
  }
  const query = params.toString();

  const response = await fetch(`/api/tasks${query ? `?${query}` : ""}`);
  if (!response.ok) {
    throw new Error("Failed to load tasks.");
  }
  return response.json();
}

function getEmptyStateMessage(search: string, category: string) {
  const hasQuery = search !== "";
  const hasCategory = category !== "All";

  if (hasQuery && hasCategory) {
    return `No "${category}" tasks match "${search}".`;
  }
  if (hasQuery) {
    return `No tasks match "${search}".`;
  }
  if (hasCategory) {
    return `No tasks in "${category}" right now.`;
  }
  return "No tasks available right now. Check back soon.";
}

// Describes only what's currently loaded (grows as "Load more" fetches
// additional pages) -- never a total/available count, since keyset
// pagination never computes one.
function getResultsContext(count: number, search: string, category: string) {
  const context: string[] = [];
  if (search) context.push(`matching "${search}"`);
  if (category !== "All") context.push(`in ${category}`);
  const suffix = context.length > 0 ? ` ${context.join(" ")}` : "";
  return `Showing ${count} task${count === 1 ? "" : "s"}${suffix}`;
}

function TaskCardSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="h-4 w-3/4 animate-pulse rounded bg-surface-muted" />
      <div className="h-7 w-24 animate-pulse rounded bg-surface-muted" />
      <div className="flex gap-2">
        <div className="h-5 w-16 animate-pulse rounded-full bg-surface-muted" />
        <div className="h-5 w-20 animate-pulse rounded-full bg-surface-muted" />
      </div>
      <div className="h-4 w-full animate-pulse rounded bg-surface-muted" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-surface-muted" />
      <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
        <div className="h-3 w-16 animate-pulse rounded bg-surface-muted" />
        <div className="h-7 w-16 animate-pulse rounded-full bg-surface-muted" />
      </div>
    </div>
  );
}

export function MarketplaceBrowser({
  initialTasks,
  initialNextCursor,
}: {
  initialTasks: Task[];
  initialNextCursor: TaskCursor | null;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const isDefaultView = debouncedSearch === "" && selectedCategory === "All";

  const {
    data,
    isPending,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["marketplace-tasks", debouncedSearch, selectedCategory],
    queryFn: ({ pageParam }) =>
      fetchTaskPage(debouncedSearch, selectedCategory, pageParam),
    initialPageParam: null as TaskCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // The default (no search, "All" category) first page was already
    // fetched server-side in app/marketplace/page.tsx -- reuse it here
    // instead of re-requesting the same page again on mount.
    initialData: isDefaultView
      ? {
          pages: [{ tasks: initialTasks, nextCursor: initialNextCursor }],
          pageParams: [null],
        }
      : undefined,
  });

  const tasks = useMemo(
    () => data?.pages.flatMap((page) => page.tasks) ?? [],
    [data]
  );

  const hasActiveFilters = debouncedSearch !== "" || selectedCategory !== "All";

  const handleClearFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setSelectedCategory("All");
  };

  return (
    <div className="flex flex-col gap-6">
      <SearchBar value={searchInput} onChange={setSearchInput} />
      <FilterChips
        categories={CATEGORIES}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      {isPending && (
        <div role="status" aria-label="Loading tasks">
          <span className="sr-only">Loading tasks…</span>
          <div className={RESULTS_GRID_CLASSES} aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <TaskCardSkeleton key={index} />
            ))}
          </div>
        </div>
      )}

      {!isPending && isError && (
        <StateCard
          title="Something went wrong"
          message="We couldn't load tasks."
          className="shadow-sm"
        >
          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        </StateCard>
      )}

      {!isPending && !isError && tasks.length === 0 && (
        <StateCard
          title="No tasks found"
          message={getEmptyStateMessage(debouncedSearch, selectedCategory)}
          className="shadow-sm"
        >
          {hasActiveFilters && (
            <div className="mt-4">
              <Button variant="secondary" size="sm" onClick={handleClearFilters}>
                Clear filters
              </Button>
            </div>
          )}
        </StateCard>
      )}

      {!isPending && !isError && tasks.length > 0 && (
        <>
          <p aria-live="polite" className="text-sm text-zinc-500">
            {getResultsContext(tasks.length, debouncedSearch, selectedCategory)}
          </p>

          <div className={RESULTS_GRID_CLASSES}>
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>

          <div className="flex justify-center pt-2">
            {hasNextPage ? (
              <Button
                variant="secondary"
                onClick={() => fetchNextPage()}
                loading={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            ) : (
              <p className="text-sm text-zinc-500">
                You&apos;ve seen all available tasks.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
