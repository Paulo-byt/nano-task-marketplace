"use client";

import { useMemo, useState } from "react";
import type { Task } from "@/types/task";
import { SearchBar } from "@/components/marketplace/SearchBar";
import { FilterChips } from "@/components/marketplace/FilterChips";
import { TaskCard } from "@/components/marketplace/TaskCard";

const CATEGORIES = ["All", "Writing", "AI", "Research", "Design", "Social"];

function getEmptyStateMessage(searchQuery: string, selectedCategory: string) {
  const query = searchQuery.trim();
  const hasQuery = query !== "";
  const hasCategory = selectedCategory !== "All";

  if (hasQuery && hasCategory) {
    return `No "${selectedCategory}" tasks match "${query}".`;
  }
  if (hasQuery) {
    return `No tasks match "${query}".`;
  }
  if (hasCategory) {
    return `No tasks in "${selectedCategory}" right now.`;
  }
  return "No tasks available right now.";
}

export function MarketplaceBrowser({ tasks }: { tasks: Task[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesCategory =
        selectedCategory === "All" || task.category === selectedCategory;
      const matchesQuery =
        query === "" ||
        task.title.toLowerCase().includes(query) ||
        task.description.toLowerCase().includes(query);

      return matchesCategory && matchesQuery;
    });
  }, [tasks, searchQuery, selectedCategory]);

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("All");
  };

  return (
    <div className="flex flex-col gap-6">
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      <FilterChips
        categories={CATEGORIES}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      {filteredTasks.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {getEmptyStateMessage(searchQuery, selectedCategory)}
          </p>
          <button
            type="button"
            onClick={handleClearFilters}
            className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
