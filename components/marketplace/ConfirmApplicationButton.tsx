"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { Button } from "@/components/ui/Button";
import type { Task } from "@/types/task";

type Status =
  | "idle"
  | "loading"
  | "duplicate"
  | "not_open"
  | "not_funded"
  | "error";

// Shared verbatim with the fundingStatus precondition check below -- a
// 409 not_funded response means the same fact this component already
// knew how to say before ever hitting the network, so the two must never
// drift into contradictory wording.
const NOT_FUNDED_MESSAGE =
  "This task isn't funded yet. Check back once the creator funds it.";

// POST /api/applications (app/api/applications/route.ts) already
// distinguishes exactly these three 409 reasons in its response body --
// duplicate / not_open / not_funded, each with its own {status} value.
// Anything else (an unrecognized or missing status) falls back to the
// generic error state rather than being assumed to mean any one of them.
function isKnown409Status(value: unknown): value is "duplicate" | "not_open" | "not_funded" {
  return value === "duplicate" || value === "not_open" || value === "not_funded";
}

export function ConfirmApplicationButton({
  taskId,
  fundingStatus,
}: {
  taskId: string;
  fundingStatus: Task["fundingStatus"];
}) {
  const router = useRouter();
  const { isConnected, isAuthenticated } = useWallet();
  const [status, setStatus] = useState<Status>("idle");

  const handleConfirm = async () => {
    setStatus("loading");

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });

      if (response.status === 201) {
        router.push("/dashboard/my-tasks");
        return;
      }

      if (response.status === 409) {
        // Never assumed to mean "duplicate" -- the same real, unmodified
        // route also returns 409 for not_open and not_funded, and
        // collapsing all three into one message is exactly the bug this
        // fix closes (11D Step 7b).
        const data = await response.json().catch(() => null);
        setStatus(isKnown409Status(data?.status) ? data.status : "error");
        return;
      }

      setStatus("error");
    } catch {
      setStatus("error");
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-1 flex-col items-start gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Connect your wallet to apply for this task.
        </p>
        <ConnectWalletButton />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 flex-col items-start gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Sign in to apply for this task.
        </p>
        <ConnectWalletButton />
      </div>
    );
  }

  if (fundingStatus !== "funded") {
    return (
      <div className="flex flex-1 flex-col items-start gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {NOT_FUNDED_MESSAGE}
        </p>
      </div>
    );
  }

  if (status === "duplicate") {
    return (
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          You&apos;ve already applied to this task.
        </p>
        <Button href="/dashboard/my-tasks" variant="brand" size="lg" className="flex-1">
          View My Tasks
        </Button>
      </div>
    );
  }

  if (status === "not_open") {
    return (
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This task is no longer accepting applications.
        </p>
        <Button href="/marketplace" variant="brand" size="lg" className="flex-1">
          Back to Marketplace
        </Button>
      </div>
    );
  }

  if (status === "not_funded") {
    return (
      <div className="flex flex-1 flex-col items-start gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {NOT_FUNDED_MESSAGE}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2">
      <Button
        variant="brand"
        size="lg"
        className="flex-1"
        onClick={handleConfirm}
        disabled={status === "loading"}
      >
        {status === "loading" ? "Applying…" : "Confirm Application"}
      </Button>
      {status === "error" && (
        <p className="text-sm text-error">
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  );
}
