"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";

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
        <Button variant="destructive" size="sm" onClick={handleCancel}>
          Confirm
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setStatus("idle")}>
          Back
        </Button>
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
        {status === "loading" ? "Cancelling…" : "Cancel Task"}
      </Button>
      {status === "error" && error && (
        <p className="max-w-[16rem] text-right text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
