import type { Applicant } from "@/types/postedTask";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ApproveApplicationButton } from "@/components/dashboard/ApproveApplicationButton";
import { RejectApplicationButton } from "@/components/dashboard/RejectApplicationButton";
import { ReleasePayoutButton } from "@/components/dashboard/ReleasePayoutButton";
import { RevokeApprovalButton } from "@/components/dashboard/RevokeApprovalButton";
import { RetryPayoutButton } from "@/components/dashboard/RetryPayoutButton";
import { EvaluateSubmissionButton } from "@/components/ai/EvaluateSubmissionButton";
import { AnalyzeFraudRiskButton } from "@/components/ai/AnalyzeFraudRiskButton";

type BadgeTone = "success" | "warning" | "error" | "neutral" | "info";

const VERDICT_TONES: Record<
  NonNullable<Applicant["evaluationVerdict"]>,
  BadgeTone
> = {
  meets_requirements: "success",
  partially_meets_requirements: "warning",
  does_not_meet_requirements: "error",
};

const VERDICT_LABELS: Record<
  NonNullable<Applicant["evaluationVerdict"]>,
  string
> = {
  meets_requirements: "Meets Requirements",
  partially_meets_requirements: "Partially Meets Requirements",
  does_not_meet_requirements: "Does Not Meet Requirements",
};

// Same tones MyTasksList.tsx uses for these exact statuses.
const STATUS_TONES: Record<Applicant["status"], BadgeTone> = {
  applied: "info",
  approved: "success",
  completed: "success",
  rejected: "error",
};

const PAYOUT_STATUS_TONES: Record<
  "completed" | "failed" | "cancelled" | "retrying",
  BadgeTone
> = {
  completed: "success",
  failed: "error",
  cancelled: "neutral",
  retrying: "warning",
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

const RISK_TONES: Record<NonNullable<Applicant["fraudRiskLevel"]>, BadgeTone> = {
  low: "success",
  medium: "warning",
  high: "error",
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
    <Card>
      <h2 className="border-b border-border px-5 py-4 text-sm font-semibold text-foreground">
        Applicants
      </h2>

      {applicants.length > 0 ? (
        <ul className="divide-y divide-border">
          {applicants.map((applicant) => (
            <li key={applicant.applicationId} className="flex flex-col gap-3 px-5 py-4">
              {/* flex-wrap (not flex-shrink-0 on the actions group) is the
                  actual mobile fix: once the status badge + action buttons
                  no longer fit beside the identity block, they drop to
                  their own row(s) instead of compressing the applicant's
                  name/date into a sliver. items-start (not items-center)
                  so a wrapped second row aligns under the first rather than
                  trying to vertically center against it. */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {applicant.applicant}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Applied {applicant.appliedAt}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONES[applicant.status]} className="capitalize">
                    {applicant.status}
                  </Badge>
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
                    <Badge tone={PAYOUT_STATUS_TONES[applicant.payoutStatus]}>
                      {PAYOUT_STATUS_LABELS[applicant.payoutStatus]}
                    </Badge>
                  )}
                </div>
              </div>
              {applicant.submissionContent && (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2">
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium text-foreground">
                      Submission:{" "}
                    </span>
                    {applicant.submissionContent}
                  </p>
                  {applicant.evaluationVerdict ? (
                    <div className="flex flex-col items-start gap-1">
                      <Badge tone={VERDICT_TONES[applicant.evaluationVerdict]}>
                        {VERDICT_LABELS[applicant.evaluationVerdict]}
                      </Badge>
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
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2">
                  {applicant.fraudRiskLevel ? (
                    <div className="flex flex-col items-start gap-1">
                      <Badge tone={RISK_TONES[applicant.fraudRiskLevel]}>
                        {RISK_LABELS[applicant.fraudRiskLevel]}
                      </Badge>
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
    </Card>
  );
}
