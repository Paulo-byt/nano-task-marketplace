import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

// Small, local, hand-rolled icons -- the same precedent
// components/layout/Sidebar.tsx already established (MenuIcon/CloseIcon)
// rather than adding an icon-library dependency for a handful of glyphs.
// Kept page-local, not promoted to components/ui/, since nothing outside
// this page uses them.
function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" />
    </svg>
  );
}

// The one repeated visual motif tying every section together -- a small,
// restrained brand-tinted circle (bg-primary/10, never a solid fill for
// ordinary content -- globals.css's own Step A comment is explicit that
// bg-foreground, not primary, is this app's default button-fill language)
// that carries color through the page via accents.
function IconBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      {children}
    </span>
  );
}

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Find a task",
    description: "Browse available micro-tasks, or post your own with a USDC reward.",
    icon: <SearchIcon />,
  },
  {
    step: "02",
    title: "Complete it",
    description: "Follow the instructions, do the work, and submit it for review.",
    icon: <CheckIcon />,
  },
  {
    step: "03",
    title: "Get paid",
    description: "Accepted work earns USDC — released as soon as it's approved.",
    icon: <SparkleIcon />,
  },
];

// Short-form versions of the exact same steps below, as a compact,
// scannable flow (chips + arrows) rather than another block of bulleted
// sentences -- fills the panel's own space with a real visual device
// instead of more whitespace, without inventing anything not already
// stated in the fuller sentence below it.
const TASKER_FLOW = ["Browse", "Choose", "Work", "Submit", "Earn"];
const CREATOR_FLOW = ["Create", "Fund", "Review", "Get it done"];

const TASKER_STEPS =
  "Browse available tasks, choose the ones that fit, complete the work, and get paid in USDC once it's approved.";

const CREATOR_STEPS =
  "Create a task, set the USDC reward, review submissions, and release the payout once the work is approved.";

// Reflects exactly the three real AI-assisted actions in the app
// (components/ai/GenerateTaskButton.tsx, EvaluateSubmissionButton.tsx,
// AnalyzeFraudRiskButton.tsx) -- each assists a creator's own review, it
// never approves work, releases a payout, or blocks anything by itself.
const AI_FEATURES = [
  {
    title: "Create better tasks",
    description: "Turns a rough idea into a clear, well-described task.",
    icon: <SparkleIcon />,
  },
  {
    title: "Evaluate submissions",
    description: "Reviews submitted work against the task and suggests a verdict.",
    icon: <CheckIcon />,
  },
  {
    title: "Flag potential fraud",
    description: "Checks for risk signals so creators know what to look at.",
    icon: <SparkleIcon />,
  },
];

// Illustrative only -- not a live feed. Titles and rewards match real
// templates on the platform (Classify text sentiment $0.15, Write a
// crypto-community announcement $0.50, Research a Web3 protocol's core
// mechanism $2.50), confirmed against this project's own template data,
// so the preview never contradicts actual platform behavior -- but this
// panel does not query live availability, so it's explicitly labeled
// "Example tasks" rather than implying these specific instances are
// open right now. Difficulty-to-tone mapping matches
// components/marketplace/TaskCard.tsx's own DIFFICULTY_TONES exactly, so
// this preview reads as the same product as the real marketplace list.
// estimatedTime is the one added metadata layer -- a real field every
// task carries (see the "Est. Time" row in TaskDetails.tsx) -- with
// illustrative values proportional to each example's own difficulty/
// reward, not measured live data.
const PREVIEW_TASKS = [
  { title: "Classify text sentiment", difficulty: "Beginner", reward: "0.15", estimatedTime: "< 5 min" },
  { title: "Write a crypto-community announcement", difficulty: "Intermediate", reward: "0.50", estimatedTime: "10-15 min" },
  { title: "Research a Web3 protocol's core mechanism", difficulty: "Advanced", reward: "2.50", estimatedTime: "30-45 min" },
] as const;

const PREVIEW_DIFFICULTY_TONES = {
  Beginner: "success",
  Intermediate: "warning",
  Advanced: "error",
} as const;

export default function Home() {
  return (
    <>
      <div className="border-b border-border bg-background px-6 py-16 sm:py-24">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <Badge tone="neutral">Micro-tasks paid in USDC</Badge>

            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Micro-tasks. Real payouts.
            </h1>

            <p className="mt-4 max-w-md text-base text-zinc-600 dark:text-zinc-400 sm:text-lg">
              Taskers discover and complete small jobs to earn USDC. Creators
              post work, fund it, and get it done — no bank account required,
              just a wallet.
            </p>

            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button
                href="/marketplace"
                variant="brand"
                size="lg"
                className="w-full sm:w-auto"
              >
                Browse Tasks
              </Button>
              <Button
                href="/marketplace/new"
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
              >
                Create a Task
              </Button>
            </div>

            <Link
              href="/get-started"
              className="mt-4 text-sm font-medium text-zinc-600 underline-offset-2 hover:text-foreground hover:underline dark:text-zinc-400"
            >
              New here? See how it works →
            </Link>
          </div>

          {/* Product preview -- built entirely from Card/Badge, doing the
              visual work a screenshot would, without faking one. */}
          <Card className="w-full p-5 shadow-lg sm:p-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <span className="text-sm font-semibold text-foreground">
                On the marketplace
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                Example tasks
              </span>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {PREVIEW_TASKS.map((task) => (
                <li
                  key={task.title}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-muted px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {task.title}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge tone={PREVIEW_DIFFICULTY_TONES[task.difficulty]}>
                        {task.difficulty}
                      </Badge>
                      <span className="text-xs text-zinc-500">{task.estimatedTime}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-primary">
                    ${task.reward}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {/* One connected panel (shared border, internal dividers) instead of
          three separate bordered cards with gaps and arrows between them --
          unity itself is what reads as "one flow," not a connector element
          bolted between independent boxes. Section background is muted so
          the white panel floors above it; deliberately breaks the
          white-hero-into-white-section adjacency this page otherwise had
          at the very top. */}
      <section
        aria-labelledby="how-it-works-heading"
        className="border-b border-border bg-surface-muted px-6 py-14 sm:py-20"
      >
        <div className="mx-auto w-full max-w-5xl">
          <h2
            id="how-it-works-heading"
            className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            How it works
          </h2>

          <div className="mt-10 grid grid-cols-1 divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <IconBadge>{item.icon}</IconBadge>
                  <span className="text-2xl font-bold text-primary/30" aria-hidden="true">
                    {item.step}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* bg-background here (matching Hero, not the muted How-it-works
          section immediately above) keeps the page alternating rather than
          repeating; the creator panel's own bg-primary/5 tint still pops
          against it regardless. The creator panel is deliberately
          hand-styled rather than passing conflicting bg/border classes
          into Card's own className, which would fight Card's base classes
          for the same CSS properties in a Tailwind-build-order-dependent
          way -- safer to just write the two classes directly. */}
      <section
        aria-labelledby="both-sides-heading"
        className="border-b border-border bg-background px-6 py-14 sm:py-20"
      >
        <div className="mx-auto w-full max-w-5xl">
          <h2
            id="both-sides-heading"
            className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            Built for both sides of the marketplace
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Card className="p-6 shadow-sm sm:p-8">
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                For taskers
              </span>
              <div className="mt-3 flex items-center gap-3">
                <IconBadge>
                  <SearchIcon />
                </IconBadge>
                <h3 className="text-base font-semibold text-foreground">
                  Complete tasks. Get paid.
                </h3>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-1.5 gap-y-2">
                {TASKER_FLOW.map((step, index) => (
                  <Fragment key={step}>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {step}
                    </span>
                    {index < TASKER_FLOW.length - 1 && (
                      <span aria-hidden="true" className="text-xs text-zinc-400 dark:text-zinc-600">
                        &rarr;
                      </span>
                    )}
                  </Fragment>
                ))}
              </div>
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{TASKER_STEPS}</p>
            </Card>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 shadow-sm sm:p-8">
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                For creators
              </span>
              <div className="mt-3 flex items-center gap-3">
                <IconBadge>
                  <SparkleIcon />
                </IconBadge>
                <h3 className="text-base font-semibold text-foreground">
                  Post work. Get it done.
                </h3>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-1.5 gap-y-2">
                {CREATOR_FLOW.map((step, index) => (
                  <Fragment key={step}>
                    <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                      {step}
                    </span>
                    {index < CREATOR_FLOW.length - 1 && (
                      <span aria-hidden="true" className="text-xs text-zinc-400 dark:text-zinc-600">
                        &rarr;
                      </span>
                    )}
                  </Fragment>
                ))}
              </div>
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{CREATOR_STEPS}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Editorial treatment, not a third card grid: one bordered surface
          carries the "AI works behind the scenes" statement, with the
          three capabilities as lighter sub-items inside it rather than
          three more equal-weight Cards. Outer section is muted (continuing
          the muted/white alternation established above); the inner surface
          flips to bg-surface (white) so it still floors above its own
          section, the same layering principle used everywhere else on the
          page, just with the two roles swapped from the section above. */}
      <section
        aria-labelledby="ai-trust-heading"
        className="border-b border-border bg-surface-muted px-6 py-14 sm:py-20"
      >
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-surface p-8 text-center shadow-sm sm:p-10">
          <IconBadge>
            <SparkleIcon />
          </IconBadge>
          <h2
            id="ai-trust-heading"
            className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            AI works behind the scenes
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
            It supports the marketplace — it isn&rsquo;t the product. Every
            decision it assists with still goes through a real review.
          </p>

          {/* The one added product visual: a compact mockup of the real
              submission review flow (a real task's submission genuinely
              goes through automated review, then a fraud/risk check,
              before a decision is recorded) -- generic, accurate labels
              only, no claim about which specific mechanism (model-based or
              rule-based) produced the review, no live data, no autonomy
              claim. */}
          <div className="mx-auto mt-6 flex w-full max-w-sm flex-col gap-3 rounded-xl border border-border bg-surface-muted p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Example review</span>
              <Badge tone="success">Accepted</Badge>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-medium text-zinc-500">
              <span>Submitted</span>
              <span aria-hidden="true">&rarr;</span>
              <span>Reviewed</span>
              <span aria-hidden="true">&rarr;</span>
              <span>Risk checked</span>
              <span aria-hidden="true">&rarr;</span>
              <span className="text-foreground">Decision</span>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 border-t border-border pt-8 text-left sm:grid-cols-3">
            {AI_FEATURES.map((feature) => (
              <div key={feature.title} className="flex flex-col gap-2">
                <IconBadge>{feature.icon}</IconBadge>
                <h3 className="text-sm font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="final-cta-heading"
        className="border-b border-border bg-primary/5 px-6 py-16 sm:py-24"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <IconBadge>
            <SparkleIcon />
          </IconBadge>
          <h2
            id="final-cta-heading"
            className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            Ready to get started?
          </h2>
          <p className="mt-3 max-w-md text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
            Find your next task or post work for someone to complete.
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button
              href="/marketplace"
              variant="brand"
              size="lg"
              className="w-full sm:w-auto"
            >
              Browse Tasks
            </Button>
            <Button
              href="/marketplace/new"
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
            >
              Create a Task
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
