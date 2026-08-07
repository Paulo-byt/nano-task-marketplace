"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ConnectWalletButton() {
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
      <div className="flex flex-col items-center gap-2">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium text-foreground ${
            isCorrectNetwork
              ? "border-black/10 dark:border-white/15"
              : "border-amber-500/50"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isCorrectNetwork ? "bg-emerald-500" : "bg-amber-500"
            }`}
            aria-hidden="true"
          />
          {truncateAddress(address)}
        </span>

        {isCorrectNetwork ? (
          isAuthenticated ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Connected to ARC Testnet
            </p>
          ) : isCheckingSession ? (
            <p className="text-sm text-zinc-500">Checking sign-in status…</p>
          ) : (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Sign in to continue.
              </p>
              <button
                type="button"
                onClick={signIn}
                disabled={isSigningIn}
                className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSigningIn ? "Signing in..." : "Sign In"}
              </button>
              {signInError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {signInError}
                </p>
              )}
            </>
          )
        ) : (
          <>
            <div className="text-center">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                Wrong Network
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Please switch to ARC Testnet
              </p>
            </div>
            <button
              type="button"
              onClick={handleSwitchNetwork}
              disabled={isSwitching}
              className="rounded-full bg-amber-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSwitching ? "Switching..." : "Switch to ARC Testnet"}
            </button>
            {switchError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {switchError}
              </p>
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
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={connect}
        disabled={isConnecting}
        className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </button>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
