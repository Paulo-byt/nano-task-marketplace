"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";

type Status = "idle" | "confirming" | "loading" | "error";

export function RevokeApprovalButton({
  taskId,
  applicationId,
}: {
  taskId: string;
  applicationId: string;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleRevoke = async () => {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch(
        `/api/tasks/${taskId}/applicants/${applicationId}/revoke-approval`,
        { method: "POST" }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Failed to revoke approval.");
        setStatus("error");
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["task-applicants", taskId],
      });
    } catch {
      setError("Failed to revoke approval.");
      setStatus("error");
    }
  };

  // Revoking is a one-way business-state action (the resulting "rejected"
  // status has no path back), so unlike the other three applicant-action
  // buttons this one requires an explicit confirm step before firing.
  if (status === "confirming") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            Revoke this approval?
          </span>
          <Button variant="secondary" size="sm" onClick={() => setStatus("idle")}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={handleRevoke}>
            Confirm Revoke
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setStatus("confirming")}
        disabled={status === "loading"}
      >
        {status === "loading" ? "Revoking…" : "Revoke Approval"}
      </Button>
      {status === "error" && error && (
        <p className="max-w-[16rem] text-right text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
