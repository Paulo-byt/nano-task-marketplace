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
}
