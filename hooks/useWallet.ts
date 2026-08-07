"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import { arcTestnet } from "@/lib/arc/chains";

export interface WalletState {
  address: string | undefined;
  connectorName: string | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | undefined;
  chainName: string | undefined;
  isCorrectNetwork: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  switchToArc: () => Promise<void>;
  isAuthenticated: boolean;
  isCheckingSession: boolean;
  isSigningIn: boolean;
  signInError: string | null;
  signIn: () => Promise<void>;
}

interface SessionCheckResponse {
  authenticated: boolean;
  walletAddress?: string;
}

async function fetchSession(): Promise<SessionCheckResponse> {
  const response = await fetch("/api/auth/session");
  if (!response.ok) {
    throw new Error("Failed to check session.");
  }
  return response.json();
}

// Built locally rather than imported from lib/auth/siwe.ts: that module also
// exports generateNonce, which pulls in node:crypto and cannot be bundled
// into client code. Keep this format in sync with buildSiweMessage there --
// the server's nonce extraction depends on the "Nonce: " line matching.
function buildSignInMessage(address: string, nonce: string): string {
  const domain = window.location.host;
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    "Sign in to Nano Task Marketplace.",
    "",
    `URI: ${window.location.origin}`,
    "Version: 1",
    `Chain ID: ${arcTestnet.id}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}

export function useWallet(): WalletState {
  const { address, isConnected, isConnecting, connector, chain, chainId } =
    useConnection();
  const connectors = useConnectors();
  const { mutate: connectMutate, error } = useConnect();
  const { mutate: disconnectMutate } = useDisconnect();
  const { mutateAsync: switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const { data: session, isLoading: isCheckingSession } = useQuery({
    queryKey: ["auth-session", address],
    queryFn: fetchSession,
    enabled: isConnected && Boolean(address),
  });

  const isAuthenticated =
    isConnected &&
    Boolean(address) &&
    session?.authenticated === true &&
    session.walletAddress?.toLowerCase() === address?.toLowerCase();

  const connect = useCallback(() => {
    const nextConnector = connectors[0];
    if (!nextConnector) return;
    connectMutate({ connector: nextConnector });
  }, [connectors, connectMutate]);

  const disconnect = useCallback(async () => {
    // Awaited so the server session is actually destroyed before the UI
    // allows reconnecting -- otherwise a fast reconnect of the same address
    // can race ahead of the delete and still find a valid session.
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // best-effort; still tear down local wallet state below
    }
    // Drop the cached session check so a reconnect of the same address can't
    // instantly render as authenticated off stale data while the real check
    // is still in flight -- it must show "Checking..." then re-verify.
    queryClient.removeQueries({ queryKey: ["auth-session"] });
    disconnectMutate();
  }, [disconnectMutate, queryClient]);

  const switchToArc = useCallback(async () => {
    await switchChainAsync({ chainId: arcTestnet.id });
  }, [switchChainAsync]);

  const signIn = useCallback(async () => {
    if (!address) return;
    setIsSigningIn(true);
    setSignInError(null);

    try {
      const nonceResponse = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      if (!nonceResponse.ok) {
        throw new Error("Could not start sign-in. Please try again.");
      }
      const { nonce } = (await nonceResponse.json()) as { nonce: string };

      const message = buildSignInMessage(address, nonce);
      const signature = await signMessageAsync({ message });

      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });

      if (!verifyResponse.ok) {
        const data = await verifyResponse.json().catch(() => null);
        throw new Error(data?.error ?? "Sign-in failed. Please try again.");
      }

      await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
    } catch (err) {
      setSignInError(
        err instanceof Error
          ? err.message
          : "Sign-in failed. Please try again."
      );
    } finally {
      setIsSigningIn(false);
    }
  }, [address, signMessageAsync, queryClient]);

  return {
    address,
    connectorName: connector?.name,
    isConnected,
    isConnecting,
    chainId,
    chainName: chain?.name,
    isCorrectNetwork: isConnected && chainId === arcTestnet.id,
    error: error?.message ?? null,
    connect,
    disconnect,
    switchToArc,
    isAuthenticated,
    isCheckingSession,
    isSigningIn,
    signInError,
    signIn,
  };
}
