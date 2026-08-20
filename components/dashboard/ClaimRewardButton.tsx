"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";

type Status = "idle" | "claiming" | "success" | "error";

/**
 * Tester release (Option A): the only way an active-tier platform task's
 * reward now moves -- POSTs to the claim route, which itself re-verifies
 * ownership/verdict/payout-status from the database before calling the
 * exact same processPlatformPayoutIfEligible primitive the old automatic
 * after() trigger used. This component never assumes success client-side;
 * it only renders what the server actually confirms.
 */
export function ClaimRewardButton({
  taskId,
  applicationId,
}: {
  taskId: string;
  applicationId: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleClaim = async () => {
    setStatus("claiming");
    setError(null);

    try {
      const response = await fetch(
        `/api/tasks/${taskId}/applicants/${applicationId}/claim`,
        { method: "POST" }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Failed to claim reward.");
        setStatus("error");
        return;
      }

      setStatus("success");
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      router.refresh();
    } catch {
      setError("Failed to claim reward.");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-xs text-success">
        <span aria-hidden="true" className="font-semibold">
          ✓
        </span>
        <span className="font-medium">Reward claimed.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="brand"
        size="sm"
        onClick={handleClaim}
        disabled={status === "claiming"}
      >
        {status === "claiming" ? "Claiming…" : "Claim Reward"}
      </Button>
      {status === "error" && error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
