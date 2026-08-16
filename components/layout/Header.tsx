import Link from "next/link";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { HeaderNav } from "@/components/layout/HeaderNav";

export function Header() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4 md:flex-nowrap">
        {/* md:flex-1 mirrors the wallet wrapper below so HeaderNav (its own
            natural width, unstretched) lands mathematically centered in the
            row -- both outer regions grow equally, HeaderNav sits between
            them. HeaderNav's own order-3/md:order-2 (set in HeaderNav.tsx,
            not here) is what actually places it between brand and wallet;
            this wrapper's order just has to interleave correctly with it. */}
        <div className="order-1 flex md:flex-1">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground"
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
            >
              N
            </span>
            Nano Task Marketplace
          </Link>
        </div>

        <HeaderNav />

        <div className="order-2 flex md:order-3 md:flex-1 md:justify-end">
          <ConnectWalletButton compact />
        </div>
      </div>
    </header>
  );
}
