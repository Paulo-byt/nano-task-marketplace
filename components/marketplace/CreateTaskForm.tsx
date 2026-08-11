"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { GenerateTaskButton } from "@/components/ai/GenerateTaskButton";
import type { TaskDraft } from "@/types/ai";

const CATEGORIES = ["Writing", "AI", "Research", "Design", "Social"] as const;
const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"] as const;

type Status = "idle" | "submitting" | "error";

export function CreateTaskForm() {
  const router = useRouter();
  const { isConnected, isAuthenticated } = useWallet();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]>("Writing");
  const [difficulty, setDifficulty] =
    useState<(typeof DIFFICULTIES)[number]>("Beginner");
  const [estimatedTime, setEstimatedTime] = useState("");
  const [rewardUsdc, setRewardUsdc] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleGenerated = (draft: TaskDraft) => {
    setTitle(draft.title);
    setDescription(draft.description);
    setCategory(draft.category);
    setDifficulty(draft.difficulty);
    setEstimatedTime(draft.estimatedTime);
    setRewardUsdc(draft.rewardUsdc.toFixed(2));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setError(null);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          category,
          difficulty,
          estimatedTime,
          rewardUsdc,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Failed to create task. Please try again.");
        setStatus("error");
        return;
      }

      const data = (await response.json()) as { id: string };
      router.push(`/marketplace/${data.id}`);
    } catch {
      setError("Failed to create task. Please try again.");
      setStatus("error");
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-black/10 bg-background p-6 dark:border-white/10 sm:p-8">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Connect your wallet to post a task.
        </p>
        <ConnectWalletButton />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-black/10 bg-background p-6 dark:border-white/10 sm:p-8">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Sign in to post a task.
        </p>
        <ConnectWalletButton />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-xl border border-black/10 bg-background p-6 dark:border-white/10 sm:p-8"
    >
      <GenerateTaskButton onGenerated={handleGenerated} />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="title"
          className="text-xs uppercase tracking-wide text-zinc-500"
        >
          Title
        </label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/15"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="description"
          className="text-xs uppercase tracking-wide text-zinc-500"
        >
          Description
        </label>
        <textarea
          id="description"
          required
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/15"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="category"
            className="text-xs uppercase tracking-wide text-zinc-500"
          >
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as (typeof CATEGORIES)[number])
            }
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/15"
          >
            {CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="difficulty"
            className="text-xs uppercase tracking-wide text-zinc-500"
          >
            Difficulty
          </label>
          <select
            id="difficulty"
            value={difficulty}
            onChange={(event) =>
              setDifficulty(
                event.target.value as (typeof DIFFICULTIES)[number]
              )
            }
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/15"
          >
            {DIFFICULTIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="rewardUsdc"
            className="text-xs uppercase tracking-wide text-zinc-500"
          >
            Reward (USDC)
          </label>
          <input
            id="rewardUsdc"
            type="number"
            required
            min="0.01"
            max="5.00"
            step="0.01"
            value={rewardUsdc}
            onChange={(event) => setRewardUsdc(event.target.value)}
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/15"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="estimatedTime"
            className="text-xs uppercase tracking-wide text-zinc-500"
          >
            Estimated time
          </label>
          <input
            id="estimatedTime"
            type="text"
            required
            placeholder="e.g. 15 min"
            value={estimatedTime}
            onChange={(event) => setEstimatedTime(event.target.value)}
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/15"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex items-center justify-center rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "submitting" ? "Posting…" : "Post Task"}
        </button>
        {status === "error" && error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    </form>
  );
}
