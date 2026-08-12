"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

type Status = "idle" | "confirming" | "loading" | "error";

export function RetryPayoutButton({
  taskId,
  applicationId,
}: {
  taskId: string;
  applicationId: string;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleRetry = async () => {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch(
        `/api/tasks/${taskId}/applicants/${applicationId}/retry-payout`,
        { method: "POST" }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Failed to retry payout.");
        setStatus("error");
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["task-applicants", taskId],
      });
    } catch {
      setError("Failed to retry payout.");
      setStatus("error");
    }
  };

  // A retry is another real fund-movement attempt, so -- like revoking --
  // it requires an explicit confirm step rather than firing immediately.
  if (status === "confirming") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            Retry this payout?
          </span>
          <button
            type="button"
            onClick={() => setStatus("idle")}
            className="inline-flex items-center justify-center rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center justify-center rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:opacity-90"
          >
            Confirm Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setStatus("confirming")}
        disabled={status === "loading"}
        className="inline-flex items-center justify-center rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading" ? "Retrying…" : "Retry Payout"}
      </button>
      {status === "error" && error && (
        <p className="max-w-[16rem] text-right text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
