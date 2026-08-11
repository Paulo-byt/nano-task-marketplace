import type { Task } from "@/types/task";

export interface PostedTask {
  id: string;
  title: string;
  rewardUsdc: number;
  category: Task["category"];
  difficulty: Task["difficulty"];
  fundingStatus: Task["fundingStatus"];
  createdAt: string;
  applicantCount: number;
}

export interface Applicant {
  applicationId: string;
  applicant: string;
  status: "applied" | "approved" | "rejected" | "completed";
  appliedAt: string;
  payoutStatus: "pending" | "completed" | "failed" | null;
  submissionId: string | null;
  submissionContent: string | null;
  submittedAt: string | null;
  evaluationVerdict:
    | "meets_requirements"
    | "partially_meets_requirements"
    | "does_not_meet_requirements"
    | null;
  evaluationFeedback: string | null;
  // Creator-only: the worker's own view (MyTask) deliberately has no
  // equivalent fields, the same worker-invisibility precedent Step 13
  // established for evaluation.
  fraudRiskLevel: "low" | "medium" | "high" | null;
  fraudExplanation: string | null;
  fraudAnalyzedAt: string | null;
}
