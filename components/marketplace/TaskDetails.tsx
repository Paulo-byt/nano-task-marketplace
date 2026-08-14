import Link from "next/link";
import type { Task } from "@/types/task";
import { getExecutorAddress } from "@/lib/arc/payoutRelay";
import { FundTaskButton } from "@/components/marketplace/FundTaskButton";

const DIFFICULTY_STYLES: Record<Task["difficulty"], string> = {
  Beginner: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Intermediate: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Advanced: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const FUNDING_STATUS_STYLES: Record<Task["fundingStatus"], string> = {
  unfunded: "bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-400",
  funded: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  released: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const FUNDING_STATUS_LABELS: Record<Task["fundingStatus"], string> = {
  unfunded: "Not yet funded",
  funded: "Funded",
  released: "Funded",
  cancelled: "Cancelled",
};

// 11D Step 2: mirrors, read-only, the exact literal string
// generateTaskInstance (services/marketplace/taskTemplatesService.ts)
// embeds for a payload-sourced instance:
// `${reserved.description}\n\n---\nPayload:\n${claimedItem.content}`.
// Matching the FULL literal marker (not a loose "---" or "Payload:"
// search) is what keeps this safe: an ordinary description that merely
// contains the word "Payload:" somewhere never matches, and payload
// content that happens to contain "---" or "Payload:" itself is never
// re-split, because splitting stops at the first occurrence of this
// exact sequence and everything after it is taken as payload content
// verbatim, byte-for-byte, with no further parsing.
const PAYLOAD_SEPARATOR = "\n\n---\nPayload:\n";

interface DescriptionParts {
  instructions: string;
  payload: string | null;
}

/**
 * Splits a task's stored description into the template's own
 * instructions and (for a payload-sourced instance only) the claimed
 * payload content, purely for presentation -- 11C's write/claim side is
 * untouched by this, and nothing here fetches, interprets, or mutates
 * the payload content itself. A self-contained task, or any description
 * that doesn't contain the exact marker, returns the description
 * unchanged with payload: null -- byte-for-byte identical to how it
 * rendered before this split existed. A marker found with nothing (or
 * only whitespace) after it -- not producible by the real write path,
 * but not trusted blindly either -- fails safe the same way: render the
 * original description whole rather than show an empty section.
 */
function splitPayloadDescription(description: string): DescriptionParts {
  const separatorIndex = description.indexOf(PAYLOAD_SEPARATOR);
  if (separatorIndex === -1) {
    return { instructions: description, payload: null };
  }

  const instructions = description.slice(0, separatorIndex);
  const payload = description.slice(separatorIndex + PAYLOAD_SEPARATOR.length);

  if (payload.trim().length === 0) {
    return { instructions: description, payload: null };
  }

  return { instructions, payload };
}

export async function TaskDetails({ task }: { task: Task }) {
  // Server Component: resolved server-side according to the active
  // PAYOUT_CUSTODY_MODE, then passed down as a plain address string --
  // never a client-side import of executor/Circle configuration.
  const executorAddress = await getExecutorAddress();
  const { instructions, payload } = splitPayloadDescription(task.description);

  return (
    <article className="flex flex-col gap-6 rounded-xl border border-black/10 bg-background p-6 dark:border-white/10 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
          {task.category}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${DIFFICULTY_STYLES[task.difficulty]}`}
        >
          {task.difficulty}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${FUNDING_STATUS_STYLES[task.fundingStatus]}`}
        >
          {FUNDING_STATUS_LABELS[task.fundingStatus]}
        </span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {task.title}
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
          {instructions}
        </p>
      </div>

      {payload && (
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Task-specific material
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
            {payload}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-4 border-y border-black/10 py-5 dark:border-white/10 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Reward
          </dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {task.rewardUsdc.toFixed(2)} USDC
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Est. Time
          </dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {task.estimatedTime}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Creator
          </dt>
          <dd className="mt-1 truncate text-sm font-semibold text-foreground">
            {task.creator}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/marketplace/${task.id}/apply`}
          className="inline-flex flex-1 items-center justify-center rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:opacity-90 sm:flex-none sm:self-start"
        >
          Apply
        </Link>
        <FundTaskButton task={task} executorAddress={executorAddress} />
      </div>
    </article>
  );
}
