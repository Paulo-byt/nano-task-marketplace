"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseUnits, type Address } from "viem";
import { useConfig, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useWallet } from "@/hooks/useWallet";
import { usdcAbi, USDC_TOKEN_ADDRESS, USDC_DECIMALS } from "@/lib/arc/tokens";
import { Button } from "@/components/ui/Button";
import type { Task } from "@/types/task";

type Status = "idle" | "approving" | "confirming" | "verifying" | "success" | "error";

const STATUS_LABEL: Record<Status, string> = {
  idle: "",
  approving: "Approving…",
  confirming: "Confirming…",
  verifying: "Verifying…",
  success: "Task funded!",
  error: "",
};

export function FundTaskButton({
  task,
  executorAddress,
}: {
  task: Task;
  executorAddress: Address;
}) {
  const router = useRouter();
  const config = useConfig();
  const { address, isAuthenticated, isCorrectNetwork, switchToArc } = useWallet();
  const { mutateAsync: writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  const isCreator =
    isAuthenticated &&
    Boolean(address) &&
    task.creatorWalletAddress.toLowerCase() === address?.toLowerCase();

  if (!isCreator || task.fundingStatus !== "unfunded") {
    return null;
  }

  const handleSwitchNetwork = async () => {
    setIsSwitching(true);
    setError(null);
    try {
      await switchToArc();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch network.");
    } finally {
      setIsSwitching(false);
    }
  };

  const handleFund = async () => {
    setError(null);

    try {
      setStatus("approving");
      const amount = parseUnits(task.rewardUsdc.toFixed(2), USDC_DECIMALS);

      const hash = await writeContractAsync({
        address: USDC_TOKEN_ADDRESS,
        abi: usdcAbi,
        functionName: "approve",
        args: [executorAddress, amount],
      });

      setStatus("confirming");
      await waitForTransactionReceipt(config, { hash });

      setStatus("verifying");
      const response = await fetch(`/api/tasks/${task.id}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Funding verification failed.");
        setStatus("error");
        return;
      }

      setStatus("success");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Funding failed. Please try again."
      );
      setStatus("error");
    }
  };

  if (!isCorrectNetwork) {
    return (
      <div className="flex flex-1 flex-col items-start gap-2">
        <p className="text-sm text-warning">
          Switch to Arc Testnet to fund this task.
        </p>
        <Button
          variant="warning"
          size="lg"
          onClick={handleSwitchNetwork}
          disabled={isSwitching}
        >
          {isSwitching ? "Switching…" : "Switch to Arc Testnet"}
        </Button>
      </div>
    );
  }

  const isBusy = status === "approving" || status === "confirming" || status === "verifying";

  return (
    <div className="flex flex-1 flex-col gap-2">
      <Button
        variant="brand"
        size="lg"
        onClick={handleFund}
        disabled={isBusy || status === "success"}
        className="flex-1"
      >
        {isBusy || status === "success"
          ? STATUS_LABEL[status]
          : `Fund Task (${task.rewardUsdc.toFixed(2)} USDC)`}
      </Button>
      {status === "error" && error && (
        <p className="text-sm text-error">{error}</p>
      )}
    </div>
  );
}
