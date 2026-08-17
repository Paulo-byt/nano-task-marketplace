"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "./ThemeProvider";
import { QueryProvider } from "./QueryProvider";
import { WagmiProvider } from "./WagmiProvider";
import { CircleProvider } from "./CircleProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <WagmiProvider>
          <CircleProvider>{children}</CircleProvider>
        </WagmiProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
