"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

type Status = "idle" | "loading" | "error";

export function AnalyzeFraudRiskButton({
  taskId,
  applicationId,
}: {
  taskId: string;
  applicationId: string;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch(
        `/api/tasks/${taskId}/applicants/${applicationId}/analyze-fraud-risk`,
        { method: "POST" }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Failed to analyze fraud risk.");
        setStatus("error");
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["task-applicants", taskId],
      });
    } catch {
      setError("Failed to analyze fraud risk.");
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={status === "loading"}
        className="inline-flex items-center justify-center rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:hover:bg-white/5"
      >
        {status === "loading" ? "Checking…" : "Check Fraud Risk"}
      </button>
      {status === "error" && error && (
        <p className="max-w-[16rem] text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
