import type { Payout } from "@/types/dashboard";
import type { Task } from "@/types/task";

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
  // (a timestamp), never from the verdict/feedback themselves. The Step 13
  // decision to keep the actual verdict/feedback creator-only is
  // unchanged; this is coarser than that, "has someone looked at it yet,"
  // nothing about what they concluded.
  isReviewed: boolean;
}
