"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

type Status = "idle" | "loading" | "error";

export function RejectApplicationButton({
  taskId,
  applicationId,
}: {
  taskId: string;
  applicationId: string;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleReject = async () => {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch(
        `/api/tasks/${taskId}/applicants/${applicationId}/reject`,
        { method: "POST" }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Failed to reject application.");
        setStatus("error");
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["task-applicants", taskId],
      });
    } catch {
      setError("Failed to reject application.");
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleReject}
        disabled={status === "loading"}
        className="inline-flex items-center justify-center rounded-full border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400"
      >
        {status === "loading" ? "Rejecting…" : "Reject"}
      </button>
      {status === "error" && error && (
        <p className="max-w-[16rem] text-right text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
