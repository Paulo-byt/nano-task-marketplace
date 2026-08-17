"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";

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
          <Button variant="secondary" size="sm" onClick={() => setStatus("idle")}>
            Cancel
          </Button>
          <Button variant="brand" size="sm" onClick={handleRetry}>
            Confirm Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="brand"
        size="sm"
        onClick={() => setStatus("confirming")}
        disabled={status === "loading"}
      >
        {status === "loading" ? "Retrying…" : "Retry Payout"}
      </Button>
      {status === "error" && error && (
        <p className="max-w-[16rem] text-right text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
