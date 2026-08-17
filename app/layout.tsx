import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AppProviders } from "@/providers/AppProviders";
import { MainLayout } from "@/components/layout/MainLayout";

// 11G: applies the .dark class (if applicable) before first paint, so
// there is never a flash of the wrong theme. beforeInteractive injects
// this into <head> and runs it before any hydration -- see
// node_modules/next/dist/docs/01-app/03-api-reference/02-components/
// script.md. Deliberately plain JS, not a TS import: this has to run
// standalone in the browser before any app code (including
// ThemeProvider.tsx) has loaded, so its logic is duplicated here on
// purpose, not shared -- the "nano-theme" key and the light/dark/system
// interpretation must be kept in sync with ThemeProvider.tsx by hand.
const THEME_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("nano-theme");
    var isDark =
      stored === "dark" ||
      (stored !== "light" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nano Task Marketplace",
  description:
    "Post micro-tasks with USDC rewards or complete them and get paid instantly on Arc Testnet — no bank account required, just a wallet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning is scoped to this element only, and only
    // covers the attributes the bootstrap script below can touch (just
    // the "dark" class). React is explicitly told not to treat that one
    // legitimate, expected server/client difference as an error -- every
    // other mismatch on this or any other element still warns normally.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script
          id="theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
        <AppProviders>
          <MainLayout>{children}</MainLayout>
        </AppProviders>
      </body>
    </html>
  );
}
