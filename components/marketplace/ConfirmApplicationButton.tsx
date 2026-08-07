"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";

type Status = "idle" | "loading" | "duplicate" | "error";

export function ConfirmApplicationButton({ taskId }: { taskId: string }) {
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
        setStatus("duplicate");
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

  if (status === "duplicate") {
    return (
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          You&apos;ve already applied to this task.
        </p>
        <Link
          href="/dashboard/my-tasks"
          className="inline-flex flex-1 items-center justify-center rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:opacity-90"
        >
          View My Tasks
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2">
      <button
        type="button"
        onClick={handleConfirm}
        disabled={status === "loading"}
        className="inline-flex flex-1 items-center justify-center rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading" ? "Applying…" : "Confirm Application"}
      </button>
      {status === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  );
}
