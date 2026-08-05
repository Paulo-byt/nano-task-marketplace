"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "./QueryProvider";
import { WagmiProvider } from "./WagmiProvider";
import { CircleProvider } from "./CircleProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <WagmiProvider>
        <CircleProvider>{children}</CircleProvider>
      </WagmiProvider>
    </QueryProvider>
  );
}
