"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";

type Status = "idle" | "loading" | "error";

export function ApproveApplicationButton({
  taskId,
  applicationId,
}: {
  taskId: string;
  applicationId: string;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch(
        `/api/tasks/${taskId}/applicants/${applicationId}/approve`,
        { method: "POST" }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Failed to approve application.");
        setStatus("error");
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["task-applicants", taskId],
      });
    } catch {
      setError("Failed to approve application.");
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="brand"
        size="sm"
        onClick={handleApprove}
        disabled={status === "loading"}
      >
        {status === "loading" ? "Approving…" : "Approve"}
      </Button>
      {status === "error" && error && (
        <p className="text-xs text-error">{error}</p>
      )}
    </div>
  );
}
