"use client";

import type { ReactNode } from "react";
import {
  createConfig,
  http,
  injected,
  WagmiProvider as WagmiConfigProvider,
} from "wagmi";
import { arcTestnet } from "@/lib/arc/chains";

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(),
  },
  ssr: true,
});

export function WagmiProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiConfigProvider config={wagmiConfig}>{children}</WagmiConfigProvider>
  );
}
