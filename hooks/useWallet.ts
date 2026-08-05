"use client";

import { useCallback } from "react";
import {
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
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
}

export function useWallet(): WalletState {
  const { address, isConnected, isConnecting, connector, chain, chainId } =
    useConnection();
  const connectors = useConnectors();
  const { mutate: connectMutate, error } = useConnect();
  const { mutate: disconnectMutate } = useDisconnect();
  const { mutateAsync: switchChainAsync } = useSwitchChain();

  const connect = useCallback(() => {
    const nextConnector = connectors[0];
    if (!nextConnector) return;
    connectMutate({ connector: nextConnector });
  }, [connectors, connectMutate]);

  const disconnect = useCallback(() => {
    disconnectMutate();
  }, [disconnectMutate]);

  const switchToArc = useCallback(async () => {
    await switchChainAsync({ chainId: arcTestnet.id });
  }, [switchChainAsync]);

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
  };
}
