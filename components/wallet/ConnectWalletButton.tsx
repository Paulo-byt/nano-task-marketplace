"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// compact defaults to false, and every branch below only changes behavior
// when compact is explicitly true -- so every existing caller
// (ConfirmApplicationButton.tsx, CreateTaskForm.tsx, and any usage that
// doesn't pass the prop) renders byte-for-byte identically to before this
// change. Added for the homepage premium redesign, where the connected-
// wallet UI needs to live as a small header utility control rather than a
// full-size block -- solved here, in the presentation layer, rather than
// by asking every consumer to duplicate this component's real wallet/auth
// state logic.
export function ConnectWalletButton({ compact = false }: { compact?: boolean }) {
  const {
    address,
    isConnected,
    isConnecting,
    isCorrectNetwork,
    error,
    connect,
    disconnect,
    switchToArc,
    isAuthenticated,
    isCheckingSession,
    isSigningIn,
    signInError,
    signIn,
  } = useWallet();

  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const handleSwitchNetwork = async () => {
    setIsSwitching(true);
    setSwitchError(null);
    try {
      await switchToArc();
    } catch (err) {
      setSwitchError(
        err instanceof Error ? err.message : "Failed to switch network.",
      );
    } finally {
      setIsSwitching(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setIsSwitching(false);
    setSwitchError(null);
  };

  if (isConnected && address) {
    return (
      <div
        className={cn(
          "flex gap-2",
          compact ? "flex-row flex-wrap items-center" : "flex-col items-center"
        )}
      >
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full border font-medium text-foreground",
            compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
            isCorrectNetwork ? "border-border" : "border-warning/50"
          )}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              isCorrectNetwork ? "bg-success" : "bg-warning"
            )}
            aria-hidden="true"
          />
          {truncateAddress(address)}
        </span>

        {isCorrectNetwork ? (
          isAuthenticated ? (
            !compact && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Connected to Arc Testnet
              </p>
            )
          ) : isCheckingSession ? (
            !compact && <p className="text-sm text-zinc-500">Checking sign-in status…</p>
          ) : (
            <>
              {!compact && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Sign in to continue.
                </p>
              )}
              <Button
                variant="primary"
                size={compact ? "sm" : "lg"}
                onClick={signIn}
                disabled={isSigningIn}
                loading={isSigningIn}
              >
                {isSigningIn ? "Signing in..." : "Sign In"}
              </Button>
              {signInError && (
                <p className="text-sm text-error">{signInError}</p>
              )}
            </>
          )
        ) : (
          <>
            {!compact && (
              <div className="text-center">
                <p className="text-sm font-medium text-warning">
                  Wrong Network
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Please switch to Arc Testnet
                </p>
              </div>
            )}
            <Button
              variant="warning"
              size={compact ? "sm" : "lg"}
              onClick={handleSwitchNetwork}
              disabled={isSwitching}
              loading={isSwitching}
            >
              {isSwitching
                ? "Switching..."
                : compact
                  ? "Switch Network"
                  : "Switch to Arc Testnet"}
            </Button>
            {switchError && (
              <p className="text-sm text-error">{switchError}</p>
            )}
          </>
        )}

        <button
          type="button"
          onClick={handleDisconnect}
          className="text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-700 hover:underline dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-2",
        compact ? "flex-row flex-wrap items-center" : "flex-col items-center"
      )}
    >
      <Button
        variant="primary"
        size={compact ? "sm" : "lg"}
        onClick={connect}
        disabled={isConnecting}
        loading={isConnecting}
      >
        {isConnecting ? "Connecting..." : compact ? "Connect" : "Connect Wallet"}
      </Button>
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
