"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

type Status = "idle" | "submitting" | "error";

export function SubmitWorkButton({
  taskId,
  applicationId,
}: {
  taskId: string;
  applicationId: string;
}) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!content.trim()) {
      setError("Please describe the work you completed.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setError(null);

    try {
      const response = await fetch(
        `/api/tasks/${taskId}/applicants/${applicationId}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Failed to submit work.");
        setStatus("error");
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    } catch {
      setError("Failed to submit work.");
      setStatus("error");
    }
  };

  return (
    <div className="flex w-full flex-col gap-2 sm:w-64">
      <textarea
        rows={2}
        placeholder="Describe the work you completed…"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={5000}
        className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/15"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={status === "submitting"}
        className="inline-flex items-center justify-center rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "submitting" ? "Submitting…" : "Submit Work"}
      </button>
      {status === "error" && error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
