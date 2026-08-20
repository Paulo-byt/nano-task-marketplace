import type { Payout } from "@/types/dashboard";
import type { Task } from "@/types/task";
import type { SubmissionVerdict } from "@/services/submissions/submissionsService";

export interface MyTask {
  applicationId: string;
  taskId: string;
  taskTitle: string;
  rewardUsdc: number;
  status: "applied" | "approved" | "rejected" | "completed";
  appliedAt: string;
  hasSubmission: boolean;
  submissionContent: string | null;
  // null until an approval ever creates a payout row for this application
  // -- reuses the exact same real enum Payout History already renders
  // (types/dashboard.ts), never a status invented for this view.
  payoutStatus: Payout["status"] | null;
  // 11D Step 6: the same payouts.id Payout History already exposes as
  // Payout["id"] -- lets MyTasksList link directly to the matching Payout
  // History row instead of making the tasker search for it. Not a new
  // identifier, and not present until payoutStatus is also non-null.
  payoutId: Payout["id"] | null;
  // 11D Step 4: the parent task's own funding state (reuses Task's real
  // enum), used only to distinguish a "rejected" application caused by the
  // task being cancelled from a plain creator decline -- best-effort, not
  // perfectly authoritative (see getMyTasks' own doc comment).
  taskFundingStatus: Task["fundingStatus"];
  // 11D Step 4: whether an evaluation has ever been recorded for this
  // application's submission -- derived from submissions.evaluatedAt
  // (a timestamp), never from the verdict/feedback themselves. Originally
  // creator-only (Step 13); the tester release (Option A) reverses that
  // specifically for a platform-owned/active-tier task, where the worker
  // IS the only person who will ever see the result -- see
  // evaluationVerdict/evaluationFeedback below. isReviewed itself keeps its
  // original, coarser meaning ("has an evaluation run at all") and must
  // never be read as "passed."
  isReviewed: boolean;
  // Tester release (Option A): the actual terminal verdict, non-null only
  // for a platform-owned task (mirrors getMyApplicationForTask's own
  // isPlatformTask gating in applicationsService.ts) -- a creator-owned
  // task's verdict remains null here regardless of whether one exists,
  // unchanged from the original Step 13 decision for that case. This is
  // what MyTasksList/TaskDetails use to render Passed/Failed, never
  // isReviewed alone.
  evaluationVerdict: SubmissionVerdict | null;
  evaluationFeedback: string | null;
  // Tester release (Option A): mirrors MyApplicationForTask's own field --
  // whether this task's payout is explicit-claim (the 5 active-tier
  // templates) rather than automatic. Gates the Claim Reward action.
  isActiveTierTask: boolean;
}
