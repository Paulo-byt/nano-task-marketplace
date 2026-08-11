import Link from "next/link";

const LEGAL_LINKS = [
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Payment & Wallet Disclosure", href: "/payment-disclosure" },
];

export function Footer() {
  return (
    <footer className="border-t border-black/10 dark:border-white/10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-zinc-500 dark:text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <nav
          aria-label="Legal"
          className="flex flex-wrap items-center gap-x-4 gap-y-2"
        >
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p>Arc Testnet only — not a production, real-money service.</p>
      </div>
    </footer>
  );
}
