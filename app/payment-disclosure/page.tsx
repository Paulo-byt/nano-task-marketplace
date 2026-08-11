import Link from "next/link";

export const metadata = {
  title: "Payment & Wallet Disclosure (Draft) — Nano Task Marketplace",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border-t border-black/10 pt-6 dark:border-white/10">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {children}
      </div>
    </section>
  );
}

export default function PaymentDisclosurePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-4 dark:border-amber-400/40 dark:bg-amber-400/10">
        <p className="text-sm font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
          Informational only — pending legal/business review
        </p>
        <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">
          This page is a plain-language explanation of how funding and
          payout actually work today, not a final legal or financial
          disclosure. It has not been reviewed or approved by qualified
          legal or compliance counsel. See{" "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms of Service
          </Link>
          ,{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          , and{" "}
          <span className="font-mono">docs/LEGAL_REVIEW_CHECKLIST.md</span>{" "}
          for related open questions.
        </p>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Payment &amp; Wallet Disclosure (Draft)
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          How funding and payout work today, in plain language.
        </p>
      </div>

      <Section title="A non-custodial funding model">
        <p>
          The platform never takes custody of a task&apos;s reward. Funds
          stay in the task creator&apos;s own wallet from the moment a task
          is posted until the exact moment a payout is released — the
          platform cannot spend, hold, or move funds beyond that one
          authorized action.
        </p>
      </Section>

      <Section title="Creators approve spending from their own wallet">
        <p>
          To fund a task, a creator sends their own on-chain approval
          (a standard ERC-20 <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs dark:bg-white/10">approve()</code>{" "}
          transaction) granting a specific, platform-designated address
          permission to spend up to the task&apos;s exact reward amount.
          Nothing is transferred at this point — an allowance is not a
          transfer.
        </p>
      </Section>

      <Section title="The executor facilitates a direct transfer — it does not hold funds">
        <p>
          When a payout is released, an authorized &quot;executor&quot;
          submits a single{" "}
          <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs dark:bg-white/10">
            transferFrom(creator, worker, amount)
          </code>{" "}
          call using the allowance the creator already granted. Funds move
          directly from the creator&apos;s wallet to the worker&apos;s
          wallet in that one transaction — they never pass through, or rest
          in, the executor&apos;s own address. Depending on configuration,
          the executor is either a platform-held signing key or a
          Circle-managed wallet; either way, its role is limited to
          submitting this one authorized transaction, and every payout is
          independently re-verified against the blockchain&apos;s own record
          before being recorded as complete.
        </p>
      </Section>

      <Section title="Blockchain transactions are irreversible once confirmed">
        <p>
          Once a transaction is confirmed on-chain, it cannot be undone,
          reversed, or refunded by the platform. Review amounts and
          addresses carefully before approving anything in your wallet.
        </p>
      </Section>

      <Section title="You are responsible for your own wallet security">
        <p>
          The platform never asks for, and never has access to, your private
          key or seed phrase. Keeping your wallet secure — including who has
          access to the device and credentials that control it — is entirely
          your responsibility.
        </p>
      </Section>

      <Section title="Gas and network fees may apply">
        <p>
          Approving an allowance, signing in, and other on-chain actions may
          require a network (&quot;gas&quot;) fee, payable in whatever the
          connected network requires. The platform does not cover or
          reimburse these fees.
        </p>
      </Section>

      <Section title="Testnet behavior is not production, real-money behavior">
        <p>
          Every transaction described on this page currently happens on Arc{" "}
          <strong className="text-foreground">Testnet</strong>. The USDC used
          today has no real-world monetary value. Nothing about how the
          system behaves on testnet should be assumed to automatically carry
          over unchanged to a real-money deployment.
        </p>
      </Section>

      <Section title="Production deployment is not currently authorized">
        <p>
          No production, mainnet, or real-money deployment of this platform
          currently exists or is authorized. See{" "}
          <span className="font-mono">docs/DEPLOYMENT.md</span> for the
          project&apos;s current deployment status.
        </p>
      </Section>
    </div>
  );
}
