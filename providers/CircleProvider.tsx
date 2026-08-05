"use client";

import { AppKit } from "@circle-fin/app-kit";
import { createContext, useContext, useState, type ReactNode } from "react";

interface CircleContextValue {
  kit: AppKit;
}

export const CircleContext = createContext<CircleContextValue | null>(null);

export function CircleProvider({ children }: { children: ReactNode }) {
  const [kit] = useState(() => new AppKit());

  return (
    <CircleContext.Provider value={{ kit }}>{children}</CircleContext.Provider>
  );
}

export function useCircleKit() {
  const context = useContext(CircleContext);

  if (!context) {
    throw new Error("useCircleKit must be used within a CircleProvider");
  }

  return context.kit;
}
