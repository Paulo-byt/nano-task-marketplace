import Link from "next/link";

export const metadata = {
  title: "Terms of Service (Draft) — Nano Task Marketplace",
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

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-black/20 bg-black/[0.02] p-3 text-sm italic text-zinc-500 dark:border-white/20 dark:bg-white/[0.03] dark:text-zinc-400">
      {children}
    </p>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-4 dark:border-amber-400/40 dark:bg-amber-400/10">
        <p className="text-sm font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
          Pending legal review — not final terms
        </p>
        <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">
          This page is placeholder scaffolding, not a finished legal document.
          It was drafted to describe what the application actually does today
          and has not been reviewed, revised, or approved by a qualified
          lawyer. It does not constitute legal advice, is not binding, and
          must not be treated as final Terms of Service. See{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          ,{" "}
          <Link
            href="/payment-disclosure"
            className="underline underline-offset-2"
          >
            Payment &amp; Wallet Disclosure
          </Link>
          , and{" "}
          <span className="font-mono">docs/LEGAL_REVIEW_CHECKLIST.md</span>{" "}
          in the repository for the open questions a reviewer still needs to
          resolve.
        </p>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Terms of Service (Draft)
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Describes Nano Task Marketplace as implemented as of Phase 10,
          running on Arc Testnet only.
        </p>
      </div>

      <Section title="1. What the platform does">
        <p>
          Nano Task Marketplace is a platform where anyone can post
          micro-tasks with USDC rewards between $0.01 and $5.00, and anyone
          with a compatible crypto wallet can complete a task and be paid.
          Task drafting, submission evaluation, and fraud-risk flagging may be
          assisted by AI (Anthropic&apos;s Claude) — every one of those
          AI outputs is advisory only, and the task creator always makes the
          final decision to approve, reject, or pay a submission.
        </p>
      </Section>

      <Section title="2. User responsibilities">
        <ul className="list-disc pl-5">
          <li>
            Task creators are responsible for the accuracy of what they post
            (title, description, requirements, reward amount).
          </li>
          <li>
            Workers are responsible for genuinely completing a task&apos;s
            actual requirements before submitting.
          </li>
          <li>
            Identity on the platform is your connected wallet address, verified
            by signing a Sign-In With Ethereum (SIWE) message — there is no
            separate username or password.
          </li>
          <li>
            You are responsible for complying with these terms and all
            applicable law in your jurisdiction.
          </li>
          <li>
            You must not attempt to manipulate, deceive, or extract
            unintended behavior from the platform&apos;s AI-assisted features
            (for example, instructing the evaluator inside a submission to
            ignore its instructions).
          </li>
        </ul>
      </Section>

      <Section title="3. Wallet and blockchain responsibilities">
        <ul className="list-disc pl-5">
          <li>
            You must connect and control a compatible wallet (for example,
            MetaMask or another injected wallet) to use the platform.
          </li>
          <li>
            You are solely responsible for the security of your wallet,
            including any private key or seed phrase. The platform never asks
            for, and never stores, either.
          </li>
          <li>
            Every fund-related action requires an explicit transaction or
            signature from your own wallet — approving a spending allowance,
            or signing a sign-in message. See{" "}
            <Link href="/payment-disclosure" className="underline underline-offset-2">
              Payment &amp; Wallet Disclosure
            </Link>{" "}
            for exactly how payout is executed on your behalf once you have
            approved it.
          </li>
          <li>
            You are responsible for connecting to the correct network (Arc
            Testnet) and for any gas or network fees your wallet incurs.
          </li>
        </ul>
      </Section>

      <Section title="4. Payments and USDC">
        <p>
          Task rewards are denominated and paid in USDC on the Arc
          blockchain. The platform does not custody creator or worker funds
          at any point — see the separate{" "}
          <Link href="/payment-disclosure" className="underline underline-offset-2">
            Payment &amp; Wallet Disclosure
          </Link>{" "}
          page for a full plain-language explanation of exactly how funding
          and payout work today.
        </p>
      </Section>

      <Section title="5. Transaction irreversibility">
        <p>
          Once a blockchain transaction is confirmed, it cannot be reversed,
          cancelled, or refunded by the platform. The only way to correct an
          incorrect transfer is a new, separate transaction — nothing
          described in these terms creates an automated refund or reversal
          mechanism. Review transaction details carefully in your wallet
          before approving or signing anything.
        </p>
      </Section>

      <Section title="6. Testnet status">
        <p>
          The platform currently operates exclusively on{" "}
          <strong className="text-foreground">Arc Testnet</strong>. USDC and
          any other value used on the platform today has no real-world
          monetary value. A production, mainnet, real-money deployment is
          not currently authorized, does not exist, and nothing in these
          terms should be read as describing one.
        </p>
      </Section>

      <Section title="7. Prohibited / abusive activity">
        <p>The following are examples of activity the platform does not permit. This list is not exhaustive and is pending full legal/policy review:</p>
        <ul className="list-disc pl-5">
          <li>Attempting to circumvent rate limits or other automated abuse protections.</li>
          <li>Submitting fraudulent, duplicated, or knowingly non-responsive work in order to obtain payment.</li>
          <li>Attempting to manipulate the AI-assisted evaluation or fraud-risk systems, including prompt-injection attempts.</li>
          <li>Creating or using multiple wallets/identities to evade detection or manipulate outcomes.</li>
          <li>Posting tasks that request illegal content or illegal activity.</li>
          <li>Interfering with the platform&apos;s operation or with other users&apos; use of it.</li>
        </ul>
      </Section>

      <Section title="8. Disputes and refunds">
        <p>
          As implemented today, an application cannot be declined after it
          has been approved, and a confirmed on-chain payout cannot be
          refunded by the platform once made (see Transaction Irreversibility
          above). No formal dispute-resolution or refund process currently
          exists. This is a known, open gap flagged for legal and business
          review — see{" "}
          <span className="font-mono">docs/LEGAL_REVIEW_CHECKLIST.md</span>.
        </p>
      </Section>

      <Section title="9. Limitation of liability">
        <Placeholder>
          Placeholder. Enforceable limitation-of-liability language has not
          been drafted and must be provided by qualified legal counsel before
          this section can be considered final.
        </Placeholder>
      </Section>

      <Section title="10. Governing law and jurisdiction">
        <Placeholder>
          Placeholder. No governing jurisdiction or applicable law has been
          determined. Nothing on this page should be read as selecting one.
        </Placeholder>
      </Section>

      <Section title="11. Termination">
        <Placeholder>
          Placeholder. The conditions under which access to the platform may
          be suspended or terminated, by either the platform or a user, have
          not yet been defined.
        </Placeholder>
      </Section>

      <Section title="12. Contact">
        <Placeholder>
          Placeholder. No official legal or support contact channel has been
          established yet.
        </Placeholder>
      </Section>
    </div>
  );
}
