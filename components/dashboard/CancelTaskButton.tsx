"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

type Status = "idle" | "confirming" | "loading" | "error";

export function CancelTaskButton({ taskId }: { taskId: string }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Failed to cancel task.");
        setStatus("error");
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["posted-tasks"] });
    } catch {
      setError("Failed to cancel task.");
      setStatus("error");
    }
  };

  if (status === "confirming") {
    return (
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className="text-xs text-zinc-500">Cancel this task?</span>
        <button
          type="button"
          onClick={handleCancel}
          className="inline-flex items-center justify-center rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="inline-flex items-center justify-center rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setStatus("confirming")}
        disabled={status === "loading"}
        className="inline-flex items-center justify-center rounded-full border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400"
      >
        {status === "loading" ? "Cancelling…" : "Cancel Task"}
      </button>
      {status === "error" && error && (
        <p className="max-w-[16rem] text-right text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
