"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";

type Status = "idle" | "loading" | "error";

export function ReleasePayoutButton({
  taskId,
  applicationId,
}: {
  taskId: string;
  applicationId: string;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleRelease = async () => {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch(
        `/api/tasks/${taskId}/applicants/${applicationId}/payout`,
        { method: "POST" }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Failed to release payout.");
        setStatus("error");
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["task-applicants", taskId],
      });
    } catch {
      setError("Failed to release payout.");
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="brand"
        size="sm"
        onClick={handleRelease}
        disabled={status === "loading"}
      >
        {status === "loading" ? "Releasing…" : "Release Payout"}
      </Button>
      {status === "error" && error && (
        <p className="max-w-[16rem] text-right text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
