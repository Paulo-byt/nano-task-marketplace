import type { Applicant } from "@/types/postedTask";
import { ApproveApplicationButton } from "@/components/dashboard/ApproveApplicationButton";
import { RejectApplicationButton } from "@/components/dashboard/RejectApplicationButton";
import { ReleasePayoutButton } from "@/components/dashboard/ReleasePayoutButton";
import { RevokeApprovalButton } from "@/components/dashboard/RevokeApprovalButton";
import { RetryPayoutButton } from "@/components/dashboard/RetryPayoutButton";
import { EvaluateSubmissionButton } from "@/components/ai/EvaluateSubmissionButton";
import { AnalyzeFraudRiskButton } from "@/components/ai/AnalyzeFraudRiskButton";

const VERDICT_STYLES: Record<
  NonNullable<Applicant["evaluationVerdict"]>,
  string
> = {
  meets_requirements: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  partially_meets_requirements: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  does_not_meet_requirements: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const VERDICT_LABELS: Record<
  NonNullable<Applicant["evaluationVerdict"]>,
  string
> = {
  meets_requirements: "Meets Requirements",
  partially_meets_requirements: "Partially Meets Requirements",
  does_not_meet_requirements: "Does Not Meet Requirements",
};

const STATUS_STYLES: Record<Applicant["status"], string> = {
  applied: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  completed: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const PAYOUT_STATUS_STYLES: Record<
  "completed" | "failed" | "cancelled" | "retrying",
  string
> = {
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  retrying: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

const PAYOUT_STATUS_LABELS: Record<
  "completed" | "failed" | "cancelled" | "retrying",
  string
> = {
  completed: "Paid",
  failed: "Payout Failed",
  cancelled: "Cancelled",
  retrying: "Retrying payout",
};

const RISK_STYLES: Record<NonNullable<Applicant["fraudRiskLevel"]>, string> = {
  low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  high: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const RISK_LABELS: Record<NonNullable<Applicant["fraudRiskLevel"]>, string> = {
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
};

export function ApplicantsList({
  taskId,
  applicants,
}: {
  taskId: string;
  applicants: Applicant[];
}) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10">
      <h2 className="border-b border-black/10 px-5 py-4 text-sm font-semibold text-foreground dark:border-white/10">
        Applicants
      </h2>

      {applicants.length > 0 ? (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {applicants.map((applicant) => (
            <li key={applicant.applicationId} className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {applicant.applicant}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Applied {applicant.appliedAt}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLES[applicant.status]}`}
                  >
                    {applicant.status}
                  </span>
                  {applicant.status === "applied" && (
                    <>
                      <RejectApplicationButton
                        taskId={taskId}
                        applicationId={applicant.applicationId}
                      />
                      <ApproveApplicationButton
                        taskId={taskId}
                        applicationId={applicant.applicationId}
                      />
                    </>
                  )}
                  {applicant.status === "approved" &&
                    applicant.payoutStatus !== "completed" &&
                    // A payout that is actively retrying must not be
                    // cancellable out from under an in-flight resubmission
                    // -- the backend guard (revokeApproval's conditional
                    // update) already refuses this unconditionally, but the
                    // button is hidden too rather than left to always fail.
                    applicant.payoutStatus !== "retrying" && (
                      <RevokeApprovalButton
                        taskId={taskId}
                        applicationId={applicant.applicationId}
                      />
                    )}
                  {applicant.status === "approved" &&
                    applicant.payoutStatus === "pending" && (
                      <ReleasePayoutButton
                        taskId={taskId}
                        applicationId={applicant.applicationId}
                      />
                    )}
                  {applicant.status === "approved" &&
                    applicant.payoutStatus === "failed" && (
                      <RetryPayoutButton
                        taskId={taskId}
                        applicationId={applicant.applicationId}
                      />
                    )}
                  {(applicant.payoutStatus === "completed" ||
                    applicant.payoutStatus === "failed" ||
                    applicant.payoutStatus === "cancelled" ||
                    applicant.payoutStatus === "retrying") && (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${PAYOUT_STATUS_STYLES[applicant.payoutStatus]}`}
                    >
                      {PAYOUT_STATUS_LABELS[applicant.payoutStatus]}
                    </span>
                  )}
                </div>
              </div>
              {applicant.submissionContent && (
                <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]">
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium text-foreground">
                      Submission:{" "}
                    </span>
                    {applicant.submissionContent}
                  </p>
                  {applicant.evaluationVerdict ? (
                    <div className="flex flex-col items-start gap-1">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${VERDICT_STYLES[applicant.evaluationVerdict]}`}
                      >
                        {VERDICT_LABELS[applicant.evaluationVerdict]}
                      </span>
                      {applicant.evaluationFeedback && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                          {applicant.evaluationFeedback}
                        </p>
                      )}
                    </div>
                  ) : (
                    <EvaluateSubmissionButton
                      taskId={taskId}
                      applicationId={applicant.applicationId}
                    />
                  )}
                </div>
              )}
              {applicant.submissionContent && (
                <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]">
                  {applicant.fraudRiskLevel ? (
                    <div className="flex flex-col items-start gap-1">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${RISK_STYLES[applicant.fraudRiskLevel]}`}
                      >
                        {RISK_LABELS[applicant.fraudRiskLevel]}
                      </span>
                      {applicant.fraudExplanation && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                          {applicant.fraudExplanation}
                        </p>
                      )}
                    </div>
                  ) : (
                    <AnalyzeFraudRiskButton
                      taskId={taskId}
                      applicationId={applicant.applicationId}
                    />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-zinc-500">
          No applicants yet.
        </p>
      )}
    </div>
  );
}
