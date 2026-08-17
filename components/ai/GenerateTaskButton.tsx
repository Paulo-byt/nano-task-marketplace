"use client";

import { useState } from "react";
import type { TaskDraft } from "@/types/ai";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-4">
      <label
        htmlFor="ai-hint"
        className="text-xs uppercase tracking-wide text-zinc-500"
      >
        Generate with AI (optional)
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="ai-hint"
          type="text"
          placeholder="Optional: describe what kind of task you want"
          value={hint}
          onChange={(event) => setHint(event.target.value)}
          className="flex-1"
        />
        <Button
          variant="secondary"
          size="lg"
          onClick={handleGenerate}
          disabled={status === "loading"}
        >
          {status === "loading" ? "Generating…" : "Generate with AI"}
        </Button>
      </div>
      {status === "error" && error && (
        <p className="text-sm text-error">{error}</p>
      )}
    </div>
  );
}
