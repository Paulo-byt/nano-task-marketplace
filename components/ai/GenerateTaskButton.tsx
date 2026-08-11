"use client";

import { useState } from "react";
import type { TaskDraft } from "@/types/ai";

type Status = "idle" | "loading" | "error";

export function GenerateTaskButton({
  onGenerated,
}: {
  onGenerated: (draft: TaskDraft) => void;
}) {
  const [hint, setHint] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/ai/generate-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hint: hint.trim() || undefined }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Failed to generate a task.");
        setStatus("error");
        return;
      }

      const draft = (await response.json()) as TaskDraft;
      onGenerated(draft);
      setStatus("idle");
    } catch {
      setError("Failed to generate a task.");
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
      <label
        htmlFor="ai-hint"
        className="text-xs uppercase tracking-wide text-zinc-500"
      >
        Generate with AI (optional)
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="ai-hint"
          type="text"
          placeholder="Optional: describe what kind of task you want"
          value={hint}
          onChange={(event) => setHint(event.target.value)}
          className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/15"
        />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={status === "loading"}
          className="inline-flex items-center justify-center rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:hover:bg-white/5"
        >
          {status === "loading" ? "Generating…" : "Generate with AI"}
        </button>
      </div>
      {status === "error" && error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
