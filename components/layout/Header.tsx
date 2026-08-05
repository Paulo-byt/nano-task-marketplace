import Link from "next/link";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { HeaderNav } from "@/components/layout/HeaderNav";

export function Header() {
  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4">
        <Link
          href="/"
          className="order-1 text-base font-semibold tracking-tight text-foreground"
        >
          Nano Task Marketplace
        </Link>

        <div className="order-2 md:order-3">
          <ConnectWalletButton />
        </div>

        <HeaderNav />
      </div>
    </header>
  );
}
