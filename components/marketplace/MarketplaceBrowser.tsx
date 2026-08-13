"use client";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Task } from "@/types/task";
import type { TaskCursor } from "@/services/marketplace/mockTasks";
import { SearchBar } from "@/components/marketplace/SearchBar";
import { FilterChips } from "@/components/marketplace/FilterChips";
import { TaskCard } from "@/components/marketplace/TaskCard";

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

  const { data, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery({
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
        <p className="py-16 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Loading tasks…
        </p>
      )}

      {!isPending && isError && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load tasks. Try refreshing the page.
          </p>
        </div>
      )}

      {!isPending && !isError && tasks.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {getEmptyStateMessage(debouncedSearch, selectedCategory)}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {!isPending && !isError && tasks.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>

          <div className="flex justify-center pt-2">
            {hasNextPage ? (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="rounded-full border border-black/10 px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-black/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:hover:border-white/30"
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
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
