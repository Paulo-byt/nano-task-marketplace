"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";

type Status = "idle" | "loading" | "error";

export function EvaluateSubmissionButton({
  taskId,
  applicationId,
}: {
  taskId: string;
  applicationId: string;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleEvaluate = async () => {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch(
        `/api/tasks/${taskId}/applicants/${applicationId}/evaluate`,
        { method: "POST" }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Failed to evaluate submission.");
        setStatus("error");
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["task-applicants", taskId],
      });
    } catch {
      setError("Failed to evaluate submission.");
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        size="sm"
        onClick={handleEvaluate}
        disabled={status === "loading"}
      >
        {status === "loading" ? "Evaluating…" : "Evaluate with AI"}
      </Button>
      {status === "error" && error && (
        <p className="max-w-[16rem] text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
