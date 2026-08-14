"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

type Status = "idle" | "submitting" | "success" | "error";

// The real, backend-enforced limit (app/api/tasks/[taskId]/applicants/
// [applicationId]/submit/route.ts's own MAX_CONTENT_LENGTH). Mirrored here
// only for the textarea's maxLength and the live counter -- this is
// display/UX only, never the actual authority: the route independently
// re-validates length itself regardless of what this component sends.
const MAX_CONTENT_LENGTH = 5000;

// How long the success acknowledgment stays visible before the My Tasks
// query is invalidated. Without this, a fast refetch can swap this form
// out for the parent's own "Your submission: ..." block before the
// tasker has had a real chance to see that anything happened -- exactly
// the "relies solely on the button disappearing" problem this step exists
// to fix. The confirmation is not itself the source of truth (the
// invalidated My Tasks data is); it's a deliberate pause so a real state
// change is actually perceivable before the view moves on.
const SUCCESS_ACKNOWLEDGMENT_MS = 1500;

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

      setStatus("success");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      }, SUCCESS_ACKNOWLEDGMENT_MS);
    } catch {
      setError("Failed to submit work.");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="flex w-full items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/20 dark:text-emerald-400 sm:w-64">
        <span aria-hidden="true" className="font-semibold">
          ✓
        </span>
        <span className="font-medium">Work submitted successfully.</span>
      </div>
    );
  }

  const isAtLimit = content.length >= MAX_CONTENT_LENGTH;

  return (
    <div className="flex w-full flex-col gap-1 sm:w-64">
      <textarea
        rows={2}
        placeholder="Describe the work you completed…"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={MAX_CONTENT_LENGTH}
        className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/15"
      />
      <p
        className={`text-right text-[10px] ${
          isAtLimit
            ? "text-amber-600 dark:text-amber-400"
            : "text-zinc-500 dark:text-zinc-500"
        }`}
      >
        {content.length} / {MAX_CONTENT_LENGTH}
      </p>
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
