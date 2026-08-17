"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";

// Single source of truth for the storage key -- app/layout.tsx's inline
// bootstrap script (plain JS, can't import this) must keep using the
// exact same literal string. If this ever changes, that script has to
// change with it.
const STORAGE_KEY = "nano-theme";

// localStorage has no native "changed in this same tab" event (the
// browser's own "storage" event only fires in *other* tabs) -- this is
// the same-tab notification channel setGlobalTheme uses so
// useSyncExternalStore knows to re-read the store right after a user
// picks a new theme.
type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

// Only ever consulted for the server-rendered pass -- useSyncExternalStore
// uses readStoredTheme (above) for every real client render instead, so
// localStorage is never touched during SSR.
function getServerSnapshot(): Theme {
  return "system";
}

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function isDarkFor(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && prefersDark());
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", isDarkFor(theme));
}

/**
 * "system" is never written to storage -- its absence *is* the system
 * state (mirrors app/layout.tsx's bootstrap script, which treats
 * anything other than a literal "light"/"dark" as system). Removing the
 * key on "system" rather than writing the string keeps there being
 * exactly one representation of "no explicit preference," not two.
 */
function persistTheme(theme: Theme): void {
  try {
    if (theme === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  } catch {
    // Best-effort; the applied .dark class still works for the rest of
    // this session even if storage is unavailable (private browsing,
    // storage quota, etc.) -- it just won't survive a reload.
  }
}

function setGlobalTheme(theme: Theme): void {
  persistTheme(theme);
  applyTheme(theme);
  notify();
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // useSyncExternalStore (not useState+useEffect) is what makes this
  // safe against hydration mismatches: getServerSnapshot always returns
  // "system" for the server-rendered pass, and readStoredTheme is only
  // ever called client-side, so there's no setState-after-mount
  // correction step to cause an extra render or a flash -- the bootstrap
  // script in app/layout.tsx has already applied the real .dark class
  // before this ever runs regardless.
  const theme = useSyncExternalStore(subscribe, readStoredTheme, getServerSnapshot);

  useEffect(() => {
    applyTheme(theme);

    if (theme !== "system") return;

    // Only while "system" is active: keep the page in sync if the OS
    // preference changes mid-session, without needing a reload. This
    // never changes the stored/derived `theme` value itself (it stays
    // "system") -- it only re-applies the .dark class.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyTheme("system");
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setGlobalTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
