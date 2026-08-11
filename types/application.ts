export interface MyTask {
  applicationId: string;
  taskId: string;
  taskTitle: string;
  rewardUsdc: number;
  status: "applied" | "approved" | "rejected" | "completed";
  appliedAt: string;
  hasSubmission: boolean;
  submissionContent: string | null;
}
