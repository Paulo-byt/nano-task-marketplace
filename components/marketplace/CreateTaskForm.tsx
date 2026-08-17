"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { GenerateTaskButton } from "@/components/ai/GenerateTaskButton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
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
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Connect your wallet to post a task.
        </p>
        <ConnectWalletButton />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
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
      className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8"
    >
      <GenerateTaskButton onGenerated={handleGenerated} />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="title"
          className="text-xs uppercase tracking-wide text-zinc-500"
        >
          Title
        </label>
        <Input
          id="title"
          type="text"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="description"
          className="text-xs uppercase tracking-wide text-zinc-500"
        >
          Description
        </label>
        <Textarea
          id="description"
          required
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="category"
            className="text-xs uppercase tracking-wide text-zinc-500"
          >
            Category
          </label>
          <Select
            id="category"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as (typeof CATEGORIES)[number])
            }
          >
            {CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="difficulty"
            className="text-xs uppercase tracking-wide text-zinc-500"
          >
            Difficulty
          </label>
          <Select
            id="difficulty"
            value={difficulty}
            onChange={(event) =>
              setDifficulty(
                event.target.value as (typeof DIFFICULTIES)[number]
              )
            }
          >
            {DIFFICULTIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="rewardUsdc"
            className="text-xs uppercase tracking-wide text-zinc-500"
          >
            Reward (USDC)
          </label>
          <Input
            id="rewardUsdc"
            type="number"
            required
            min="0.01"
            max="5.00"
            step="0.01"
            value={rewardUsdc}
            onChange={(event) => setRewardUsdc(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="estimatedTime"
            className="text-xs uppercase tracking-wide text-zinc-500"
          >
            Estimated time
          </label>
          <Input
            id="estimatedTime"
            type="text"
            required
            placeholder="e.g. 15 min"
            value={estimatedTime}
            onChange={(event) => setEstimatedTime(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" variant="brand" size="lg" disabled={status === "submitting"}>
          {status === "submitting" ? "Posting…" : "Post Task"}
        </Button>
        {status === "error" && error && (
          <p className="text-sm text-error">{error}</p>
        )}
      </div>
    </form>
  );
}
