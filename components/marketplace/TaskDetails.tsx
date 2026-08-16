import type { Task } from "@/types/task";
import type { MyApplicationForTask } from "@/services/applications/applicationsService";
import { getExecutorAddress } from "@/lib/arc/payoutRelay";
import { FundTaskButton } from "@/components/marketplace/FundTaskButton";
import { SubmitWorkButton } from "@/components/dashboard/SubmitWorkButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type WorkspaceTone = "success" | "warning" | "error" | "info";

const WORKSPACE_CONTAINER_STYLES: Record<WorkspaceTone, string> = {
  success: "border-emerald-500/20 bg-emerald-500/[0.03] dark:border-emerald-500/20",
  warning: "border-amber-500/20 bg-amber-500/[0.03] dark:border-amber-500/20",
  error: "border-red-500/20 bg-red-500/[0.03] dark:border-red-500/20",
  info: "border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]",
};

/**
 * M5: derives the tasker-facing workspace state purely from
 * MyApplicationForTask -- never internal implementation detail (no
 * mention of "deterministic", "testnet", provider names, or model
 * information), matching the exact three example messages this phase was
 * given. hasSubmission is checked before evaluationVerdict deliberately:
 * a creator-owned task's verdict is already nulled out at the data layer
 * (getMyApplicationForTask), so it naturally falls through to "Submitted
 * -- awaiting evaluation" here, unchanged from M4's own original message --
 * this function does not need its own platform-vs-creator branch.
 */
function describeWorkspaceState(app: MyApplicationForTask): {
  tone: WorkspaceTone;
  badgeLabel: string;
  message: string;
} {
  if (!app.hasSubmission) {
    return { tone: "success", badgeLabel: "Active", message: "You're working on this task" };
  }
  if (app.evaluationVerdict === "meets_requirements") {
    if (app.payoutStatus === "completed") {
      return { tone: "success", badgeLabel: "Paid", message: "Paid" };
    }
    if (app.payoutStatus === "failed") {
      return {
        tone: "error",
        badgeLabel: "Payout Failed",
        message: "Payout failed — requires attention",
      };
    }
    // pending, retrying, cancelled, or (defensively) null: an accepted
    // platform-task submission never reads as anything other than
    // "payout in progress" here -- M6 only ever leaves a payout in
    // "completed" or "failed" once it actually resolves one way or the
    // other, so every other state means the same thing to the worker.
    return {
      tone: "success",
      badgeLabel: "Accepted",
      message: "Accepted — payout processing",
    };
  }
  if (app.evaluationVerdict === "does_not_meet_requirements") {
    return {
      tone: "error",
      badgeLabel: "Rejected",
      message: "Rejected — submission did not meet the requirements",
    };
  }
  if (app.evaluationVerdict === "partially_meets_requirements") {
    return {
      tone: "warning",
      badgeLabel: "Under Review",
      message: "Under review — additional review is required",
    };
  }
  return { tone: "info", badgeLabel: "Submitted", message: "Submitted — awaiting evaluation" };
}

const DIFFICULTY_TONES: Record<Task["difficulty"], "success" | "warning" | "error"> = {
  Beginner: "success",
  Intermediate: "warning",
  Advanced: "error",
};

const FUNDING_STATUS_TONES: Record<
  Task["fundingStatus"],
  "success" | "error" | "neutral"
> = {
  unfunded: "neutral",
  funded: "success",
  released: "success",
  cancelled: "error",
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

export async function TaskDetails({
  task,
  myApplication,
}: {
  task: Task;
  // M4 (active-task workspace): the viewer's own application for this
  // task, if any -- undefined for every unauthenticated or not-yet-applied
  // visitor, in which case this component renders exactly as it did before
  // this prop existed. Platform-generated and creator-posted tasks are not
  // distinguished here at all: whichever task this is, an "approved"
  // application means the same thing -- the viewer may work on it now --
  // so no separate platform-specific branch exists, or is needed.
  myApplication?: MyApplicationForTask;
}) {
  // Server Component: resolved server-side according to the active
  // PAYOUT_CUSTODY_MODE, then passed down as a plain address string --
  // never a client-side import of executor/Circle configuration.
  const executorAddress = await getExecutorAddress();
  const { instructions, payload } = splitPayloadDescription(task.description);
  const workspaceState =
    myApplication?.status === "approved" ? describeWorkspaceState(myApplication) : null;

  return (
    <article className="flex flex-col gap-6 rounded-xl border border-black/10 bg-background p-6 dark:border-white/10 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{task.category}</Badge>
        <Badge tone={DIFFICULTY_TONES[task.difficulty]}>
          {task.difficulty}
        </Badge>
        <Badge tone={FUNDING_STATUS_TONES[task.fundingStatus]}>
          {FUNDING_STATUS_LABELS[task.fundingStatus]}
        </Badge>
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

      {myApplication?.status === "approved" && workspaceState ? (
        <div
          className={`flex flex-col gap-4 rounded-xl border p-5 ${WORKSPACE_CONTAINER_STYLES[workspaceState.tone]}`}
        >
          <div className="flex items-center gap-2">
            <Badge tone={workspaceState.tone}>{workspaceState.badgeLabel}</Badge>
            <p className="text-sm font-medium text-foreground">{workspaceState.message}</p>
          </div>

          {myApplication.hasSubmission ? (
            <div className="rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-zinc-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-400">
              <span className="mb-1 block font-medium text-foreground">
                Your submission
              </span>
              {myApplication.submissionContent}
              {myApplication.evaluationFeedback && (
                <p className="mt-2 border-t border-black/10 pt-2 text-zinc-500 dark:border-white/10 dark:text-zinc-500">
                  {myApplication.evaluationFeedback}
                </p>
              )}
            </div>
          ) : (
            <SubmitWorkButton
              taskId={task.id}
              applicationId={myApplication.applicationId}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            href={`/marketplace/${task.id}/apply`}
            variant="primary"
            size="lg"
            className="flex-1 sm:flex-none sm:self-start"
          >
            Apply
          </Button>
          <FundTaskButton task={task} executorAddress={executorAddress} />
        </div>
      )}
    </article>
  );
}
