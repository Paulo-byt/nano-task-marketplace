import Link from "next/link";

export const metadata = {
  title: "Privacy Policy (Draft) — Nano Task Marketplace",
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

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-4 dark:border-amber-400/40 dark:bg-amber-400/10">
        <p className="text-sm font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
          Pending legal review — not final privacy policy
        </p>
        <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">
          This page is placeholder scaffolding, not a finished legal
          document. It describes what data the application actually collects
          and processes today. It has not been reviewed or approved by a
          qualified lawyer or privacy professional, and it does not claim
          compliance with GDPR, NDPR, CCPA, or any other data protection law.
          See{" "}
          <span className="font-mono">docs/LEGAL_REVIEW_CHECKLIST.md</span>{" "}
          in the repository for the open questions a reviewer still needs to
          resolve.
        </p>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Privacy Policy (Draft)
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Describes what Nano Task Marketplace actually stores and processes
          as implemented as of Phase 10, running on Arc Testnet only.
        </p>
      </div>

      <Section title="1. Wallet addresses">
        <p>
          Your public wallet address is your identifier on the platform —
          there is no separate account, username, email, or password. A
          wallet address is pseudonymous, not anonymous: it is not tied to
          your real-world identity by the platform, but it is inherently
          public and independently visible on the blockchain regardless of
          anything the platform does.
        </p>
      </Section>

      <Section title="2. Authentication and session information">
        <p>
          Sign-in uses Sign-In With Ethereum (SIWE): the platform issues a
          one-time nonce, you sign a message containing it with your wallet,
          and the platform verifies that signature. A server-side session
          record (a session identifier and its expiry) is created and stored
          to keep you signed in; sessions currently expire automatically
          after 7 days.
        </p>
      </Section>

      <Section title="3. Task, application, and submission information">
        <p>
          The platform stores task details you post (title, description,
          reward amount, category, difficulty), application records (which
          wallet applied to which task, and its status and timestamps), and
          the actual content a worker submits for a task. Submitted content
          is visible to that task&apos;s creator and is processed by the AI
          evaluation feature described below.
        </p>
      </Section>

      <Section title="4. Fraud-risk assessment data">
        <p>
          For applications a creator chooses to run analysis on, the
          platform computes a small set of deterministic behavioral signals
          — for example, how quickly a submission followed its approval, how
          many applications or submissions the same wallet made recently,
          and whether the submitted content duplicates a prior submission
          from the same wallet — and may generate an AI-produced advisory
          risk level and explanation from those signals. This assessment
          data is stored per application, is visible to that task&apos;s
          creator, and is never used to automatically reject, block, or
          penalize anyone — a human creator always makes the final decision.
        </p>
      </Section>

      <Section title="5. Technical and log information">
        <p>
          The platform records structured operational logs — for example,
          rate-limit events, authentication failures, and the outcome of
          payout or AI-related calls — containing identifiers, timestamps,
          and non-sensitive error text. These logs are designed to exclude,
          and do not intentionally include, private keys or full submission
          content.
        </p>
      </Section>

      <Section title="6. AI processing">
        <p>
          Three specific AI-assisted features exist today, each using
          Anthropic&apos;s Claude API, and each producing advisory output
          only — none of them automatically takes action:
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong className="text-foreground">Task drafting:</strong> an
            optional, short creator-supplied hint may be sent to Claude to
            propose a task. No wallet address or other user-identifying data
            is included.
          </li>
          <li>
            <strong className="text-foreground">Submission evaluation:</strong>{" "}
            a task&apos;s title and description, together with the
            worker&apos;s submitted content, are sent to Claude to produce an
            advisory verdict and feedback for the creator.
          </li>
          <li>
            <strong className="text-foreground">Fraud-risk synthesis:</strong>{" "}
            only the pre-computed signal values described above are sent to
            Claude — never a wallet address and never raw submission content
            — to produce an advisory, hedged explanation for the creator.
          </li>
        </ul>
      </Section>

      <Section title="7. Third-party services">
        <ul className="list-disc pl-5">
          <li>
            <strong className="text-foreground">Anthropic</strong> — processes
            the AI requests described above.
          </li>
          <li>
            <strong className="text-foreground">Circle</strong> — provides
            wallet-connection infrastructure, and, only when explicitly
            enabled, an alternate payout-signing path (see{" "}
            <Link href="/payment-disclosure" className="underline underline-offset-2">
              Payment &amp; Wallet Disclosure
            </Link>
            ).
          </li>
          <li>
            <strong className="text-foreground">Neon</strong> — hosts the
            platform&apos;s database.
          </li>
          <li>
            <strong className="text-foreground">Your wallet provider</strong>{" "}
            (e.g. MetaMask) — outside the platform&apos;s control.
          </li>
        </ul>
        <p>No advertising or analytics/tracking third party is currently integrated.</p>
      </Section>

      <Section title="8. Blockchain and on-chain information">
        <p>
          Wallet addresses and transaction hashes related to funding and
          payout activity are recorded by the platform, and are also
          independently and permanently visible on Arc&apos;s public
          blockchain regardless of anything the platform does. The platform
          does not control, and cannot delete, on-chain data.
        </p>
      </Section>

      <Section title="9. Data retention">
        <Placeholder>
          Placeholder. No defined retention or deletion schedule currently
          exists for any category of data described above, including fraud
          assessments (which currently accumulate indefinitely).
        </Placeholder>
      </Section>

      <Section title="10. User rights">
        <Placeholder>
          Placeholder. Rights to access, correct, or delete your data, and
          how to exercise them, have not yet been defined.
        </Placeholder>
      </Section>

      <Section title="11. International data transfers">
        <Placeholder>
          Placeholder. Whether and how data is transferred across borders,
          and under what mechanism, has not yet been assessed.
        </Placeholder>
      </Section>

      <Section title="12. Contact">
        <Placeholder>
          Placeholder. No official privacy contact channel has been
          established yet.
        </Placeholder>
      </Section>
    </div>
  );
}
